# Email asset storage: private S3 behind Bunny CDN

## Status

| Step | State |
|---|---|
| Private bucket, Block Public Access on, **versioning enabled** | done |
| Bunny pull zone with **S3 Authentication** (its own read-only IAM user) | done |
| `assets.joonhq.com` on Bunny, HTTPS | done |
| Bucket CORS and staging lifecycle rule | done |
| API IAM user `joon-assets-api-production` | done |
| Real-bucket probe (`asset-storage-probe.ts`) | **passed**: signed upload, sanitised publish, Bunny delivery with a cache HIT, correct CORS, no public access to S3 or to staging |
| Railway `api` variables | **not set**: after #41 merges, on your approval |
| Live Studio canary (upload → save/reload → test email) | **not done**: see below |

Nothing in this folder was created or applied by Joon. The live setup was done by the owner. `verify-live-config.sh` compares it with these files; it only reads.

## Shape

```
Studio (browser) ──signed PUT──▶ S3  staging/workspaces/<ws>/stores/<store>/<uuid>   (private; never served)
Railway api      ──read, strip metadata, write──▶ S3  workspaces/<ws>/stores/<store>/email-assets/<sha256>.<ext>
Email readers    ──▶ assets.joonhq.com ──▶ Bunny pull zone ──S3 Authentication (read key)──▶ S3  (published prefixes only)
```

- **Bucket:** `joon-assets-production-632404568116-eu-north-1-an` in eu-north-1. Block Public Access is on, and there is no bucket policy.
- **Staging:** the browser's raw bytes land here, with EXIF and GPS intact. The CDN's key cannot read this prefix. The API reads the upload, re-encodes it without metadata, publishes it, then deletes the staging object.
- **Published keys** are derived from the clean bytes' SHA-256. They are written once and never replaced, so the year-long immutable cache can never hold a raw or superseded image. Only a published key's URL is ever returned or saved.
- **`ASSET_CDN_BASE_URL=https://assets.joonhq.com`.** Sent emails keep this hostname forever, so a later move from Bunny to CloudFront is a DNS change only.
- **No Bunny Storage.** Bunny pulls from S3, and nothing is stored at Bunny except its cache.

## Versioning

The bucket is versioned, which changes what "deleted" means:

- **Staging.** When the API deletes a staging object after publishing it, S3 adds a delete marker, and the raw upload stays as a **noncurrent version**. The lifecycle rule (`s3-lifecycle.json`) removes it about a day later (`NoncurrentVersionExpiration: 1 day`). It also expires uncompleted staging objects after one day and cleans up incomplete multipart uploads.
  - Until then, nobody but an owner identity can read that version: reading a named version needs `s3:GetObjectVersion`, which neither IAM user has.
  - The CI job tests this against a versioned bucket.
- **Published images** are not covered by any lifecycle rule. That's deliberate: sent emails keep referencing them.

## What each key may do

| Key | File | Allowed | Not allowed |
|---|---|---|---|
| API: IAM user `joon-assets-api-production` | `iam-joon-api.json` | Put/Get/Delete under `staging/*`; Put under `workspaces/*` and `stores/*` | read or delete published images; read any older version; list the bucket |
| Bunny: its own read-only IAM user | `iam-bunny-read.json` | Get under `workspaces/*` and `stores/*` | anything under `staging/*` (explicit deny); older versions; list; write |

- The API key is set as `ASSET_AWS_ACCESS_KEY_ID` / `ASSET_AWS_SECRET_ACCESS_KEY`, never the generic `AWS_*` pair, which SES uses.
- `stores/*` is where product-image derivatives are written. Keep it in both policies or in neither.

**Checking that the live policies match these files.** I could not read the live IAM policies, so run:
```
BUNNY_USER=<Bunny's read-only IAM user> docs/asset-storage/verify-live-config.sh
```
It prints "matches" or a diff for each user's inline and attached policies, the CORS rule and the lifecycle rule. It also prints versioning, the public-access block and whether a bucket policy exists. **Don't broaden either policy to make a diff go away.**

## CORS

`s3-cors.json` records the **live** rule, which allows any request header (`"AllowedHeaders": ["*"]`):
- The Studio's upload sends only `content-type`: the signature and every `x-amz-*` value travel in the URL's query string. So `["content-type"]` would also work.
- The live `*` is broader than needed, but it is the rule the probe passed against, so it stays as it is.
- Narrowing it is optional. If you do, rerun the probe's CORS checks afterwards.
- Origin (`https://agent.joonhq.com`) and method (`PUT`) are unchanged.

## Request checksums

The shipped signing client omits the SDK's default CRC32, which was computed over an empty body. **AWS answered HTTP 200 to both forms in the live probe**, so the old form is not known to fail on AWS. The change only removes a value that can never describe the upload; stricter S3-compatible stores would reject it.

## Remaining steps

1. **Merge #41**, on your approval.
2. **Railway `api`**, on your approval:
   - `ASSET_BUCKET`
   - `ASSET_REGION=eu-north-1`
   - `ASSET_CDN_BASE_URL=https://assets.joonhq.com`
   - `ASSET_AWS_ACCESS_KEY_ID` and `ASSET_AWS_SECRET_ACCESS_KEY` for `joon-assets-api-production`

   Leave `ASSET_S3_ENDPOINT` unset, and leave `workers` unchanged.
3. **Live Studio canary**, using your own account, a test store and one harmless photo that carries EXIF:
   1. Upload in the Studio. It appears under Uploads in the Asset Library.
   2. The item's URL is `https://assets.joonhq.com/workspaces/…/email-assets/<64 hex>.<ext>`. `curl -sI` shows `200`, the right `content-type`, and `cache-control: public,max-age=31536000,immutable`.
   3. Download it and check with `exiftool`: no GPS, camera or copyright fields.
   4. Reload the Studio: the asset is still listed. Put it in an image block, check the preview, save, reopen, and check again.
   5. **Test email.** Send the draft to one **allowlisted** address only. Production is in allowlist mode, and this is a real send, so do it yourself. Check that the image renders in the received email and that its URL is the `assets.joonhq.com` one.
   6. **Refusal path.** Upload a PDF renamed `.png`. The Studio shows "Use a JPEG, PNG, WebP or GIF image.", and nothing new appears under Uploads.

**Rollback:** unset the variables. New uploads are refused before they start, and published URLs keep working.

## Removing an image

Published objects are immutable, cached for a year, and referenced by sent emails. The API cannot delete them. Because the bucket is versioned, **`aws s3 rm` only adds a delete marker: the image stays as a noncurrent version.** To remove it completely, with your admin identity:
```
aws s3api list-object-versions --bucket <bucket> --prefix <published key> \
  --query '{versions: Versions[].VersionId, markers: DeleteMarkers[].VersionId}'
aws s3api delete-object --bucket <bucket> --key <published key> --version-id <each id above>
```
Then purge the full `https://assets.joonhq.com/…` URL in Bunny: Pull Zone → Purge. The API alternative is `POST https://api.bunny.net/purge?url=<url-encoded URL>` with your account `AccessKey`.

The image then disappears from sent emails too. That is the point of a takedown, and why it is manual.

## Cost of cache misses

Bunny fetches from S3 only on a cache miss:
- **S3 egress:** after the account-wide free 100 GB/month, $0.09/GB for the first 10 TB, plus GET request charges. Published images are immutable and cached for a year, so each file is fetched about once per Bunny edge location.
- **Bunny delivery:** Standard tier, $0.01/GB in Europe and North America, $0.03/GB in Asia and Oceania, with a $1 monthly minimum. Prices as published in September 2026.

## The CI job (`asset-storage.yml`)

It runs these files against MinIO, with only the bucket name changed, on a **versioned** bucket, and does the signed PUT from a real Chrome. MinIO is not AWS. The live probe is what established AWS's own answers.
