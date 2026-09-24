# Email asset storage: private S3 behind Bunny CDN

Nothing in this folder has been created or applied by Joon. Every step below is
yours, in order, and each has a stop point.

## Shape

```
Studio (browser) ──signed PUT──▶ S3  staging/workspaces/<ws>/stores/<store>/<uuid>   (private; never served)
Railway api      ──read, strip metadata, write──▶ S3  workspaces/<ws>/stores/<store>/email-assets/<sha256>.<ext>
Email readers    ──▶ assets.joonhq.com ──▶ Bunny pull zone ──S3 Authentication (read key)──▶ S3  (published prefixes only)
```

- **Bucket:** `joon-assets-production-632404568116-eu-north-1-an` (eu-north-1). Block Public Access stays **on**. No bucket policy is needed.
- **Staging:** the browser's raw bytes (EXIF, GPS and all) land here. The CDN's key cannot read this prefix. The API reads the file, re-encodes it without metadata, publishes it, and deletes the staging copy. A lifecycle rule expires anything left behind after one day.
- **Published keys** are derived from the clean bytes' SHA-256. They are written once and never replaced, so a year-long immutable cache can never hold a raw or superseded image. Only a published key's URL is ever returned or saved.
- **`ASSET_CDN_BASE_URL=https://assets.joonhq.com`**, never a `b-cdn.net` or `amazonaws.com` address. Sent emails keep that hostname for good, so moving from Bunny to CloudFront later is a DNS change only.
- **No Bunny Storage.** Bunny pulls from S3; nothing is stored at Bunny except its cache.

## What each key may do

| Key | File | Allowed | Not allowed |
|---|---|---|---|
| API (`joon-api-assets`) | `iam-joon-api.json` | Put/Get/Delete under `staging/*`; Put under `workspaces/*` and `stores/*` | read or delete published images; list the bucket |
| Bunny read (`joon-bunny-read`) | `iam-bunny-read.json` | Get under `workspaces/*` and `stores/*` | anything under `staging/*` (explicit deny); list; write |

`stores/*` is where product-image derivatives are written (`packages/creative-engine`). Keep it only if you want those served. If you drop it from one policy, drop it from both.

Set the API key as **`ASSET_AWS_ACCESS_KEY_ID` / `ASSET_AWS_SECRET_ACCESS_KEY`**, not the generic `AWS_*` pair. SES clients use the generic pair, and storage should not share a key with them.

If the bucket's default encryption is SSE-KMS rather than SSE-S3, both policies also need `kms:Decrypt` (and the API needs `kms:GenerateDataKey`) on that key. Tell me before creating keys if so.

The CI job `asset-storage.yml` loads these exact files into MinIO, changing only the bucket name, and proves the allow and deny lines above with a real browser. It is not AWS. The probe below is.

## Setup, in order

Each step has a check. If a check fails, stop there.

**0. Read-only checks of the bucket (your admin identity):**
```
aws s3api get-public-access-block      --bucket joon-assets-production-632404568116-eu-north-1-an
aws s3api get-bucket-ownership-controls --bucket joon-assets-production-632404568116-eu-north-1-an
aws s3api get-bucket-encryption        --bucket joon-assets-production-632404568116-eu-north-1-an
```
Expect all four public-access blocks `true`, `BucketOwnerEnforced`, and `AES256` (SSE-S3).

**1. Bunny pull zone** (you are doing this):
- origin `https://joon-assets-production-632404568116-eu-north-1-an.s3.eu-north-1.amazonaws.com`;
- Standard tier;
- no token authentication, no hotlink rules.

Open **Security**. If **S3 Authentication** is absent, stop: the fix is not to make S3 public.

**2. Bunny read key.**
- Create IAM user `joon-bunny-read` with `iam-bunny-read.json` as its only policy, plus one access key.
- In the pull zone, enable **S3 Authentication** with that key, its secret and region `eu-north-1`.

**3. One harmless object, checked through Bunny's own hostname** (before DNS):
```
aws s3 cp canary.png s3://<bucket>/workspaces/canary/stores/canary/email-assets/canary.png --content-type image/png --cache-control "public,max-age=300"
echo not-public > /tmp/secret.txt && aws s3 cp /tmp/secret.txt s3://<bucket>/staging/canary/secret.txt
curl -sI https://<zone>.b-cdn.net/workspaces/canary/stores/canary/email-assets/canary.png   # 200, image/png
curl -sI https://<bucket>.s3.eu-north-1.amazonaws.com/workspaces/canary/stores/canary/email-assets/canary.png   # 403
curl -sI https://<zone>.b-cdn.net/staging/canary/secret.txt   # 403
curl -s  https://<zone>.b-cdn.net/ | head -c 200               # 403, no <ListBucketResult>
curl -sI https://<zone>.b-cdn.net/workspaces/nope.png          # 403 (S3 hides missing keys without list permission)
```

**4. Upload rules on the bucket:**
```
aws s3api put-bucket-cors      --bucket <bucket> --cors-configuration   file://docs/asset-storage/s3-cors.json
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://docs/asset-storage/s3-lifecycle.json
```

**5. API key.** Create IAM user `joon-api-assets` with `iam-joon-api.json`, and one access key. Keep it in your shell for step 6. It goes into Railway only at step 8.

**6. Probe the real bucket and Bunny with the API key**, from your machine:
```
ASSET_BUCKET=<bucket> ASSET_REGION=eu-north-1 ASSET_CDN_BASE_URL=https://<zone>.b-cdn.net \
ASSET_AWS_ACCESS_KEY_ID=… ASSET_AWS_SECRET_ACCESS_KEY=… \
pnpm --filter @allohq/api exec tsx src/asset-storage-probe.ts
```
Every line must read `PASS` or `INFO`:
- CORS for `https://agent.joonhq.com` only;
- the shipped signed PUT;
- staging unreadable through Bunny and anonymously;
- publish without EXIF, served by Bunny as `image/jpeg`;
- anonymous S3 refused;
- no root listing.

It also records AWS's answer to the SDK-default URL with the empty-body checksum, which the shipped code no longer produces.

**7. DNS** (your approval): in Bunny, add hostname `assets.joonhq.com`, issue the free certificate and force HTTPS. In GoDaddy, CNAME `assets` → `<zone>.b-cdn.net`. Repeat step 3's `curl`s against `https://assets.joonhq.com`, and rerun step 6 with `ASSET_CDN_BASE_URL=https://assets.joonhq.com`.

**8. Railway `api`** (your approval, after #41 merges):
- `ASSET_BUCKET`
- `ASSET_REGION=eu-north-1`
- `ASSET_CDN_BASE_URL=https://assets.joonhq.com`
- `ASSET_AWS_ACCESS_KEY_ID` and `ASSET_AWS_SECRET_ACCESS_KEY`

Do not set `ASSET_S3_ENDPOINT`. Workers need these only if product derivatives are wanted; leave them unset there for the canary.

## Production canary (after step 8)

Use your own account, a test store, and one harmless photo that carries EXIF. No email is sent and no image is generated.

1. **Upload.** In the Studio, upload the photo. It appears under Uploads in the Asset Library.
2. **Published URL.** The item's URL starts `https://assets.joonhq.com/workspaces/…/email-assets/` followed by 64 hex characters. `curl -sI` shows `200`, `content-type: image/jpeg` and `cache-control: public,max-age=31536000,immutable`.
3. **No metadata.** Download it and run `exiftool` (or `identify -verbose`): no GPS, camera or copyright fields.
4. **Staging is clean.** `aws s3 ls s3://<bucket>/staging/workspaces/<ws>/` shows no object left for that upload.
5. **Direct S3 refused.** The direct S3 URL of the published key returns `403`.
6. **Save and reload.** Reload the Studio: the asset is still listed. Put it in an image block and check the preview renders it. Save, reopen, and check again.
7. **Refusal path.** Upload a PDF renamed `.png`. The Studio shows "Use a JPEG, PNG, WebP or GIF image.", nothing new appears under Uploads, and no staging object remains.

**Rollback:** unset the five variables. New uploads are refused before they start. Existing published URLs keep working, because Bunny and S3 are untouched.

## Removing an image

Published objects are immutable and cached for a year. The API cannot delete them, and emails already sent reference them. To take one down:
1. `aws s3 rm s3://<bucket>/<published key>` with your admin identity.
2. Purge the URL in Bunny: Pull Zone → Purge → the full `https://assets.joonhq.com/…` URL. The API alternative is `POST https://api.bunny.net/purge?url=<url-encoded URL>` with your account `AccessKey`.

The image then disappears from sent emails too. That is the point of a takedown, and why it is manual.

## Cost of cache misses

Bunny fetches from S3 only on a cache miss. Each miss is S3 internet egress:
- after the account-wide free **100 GB/month**, **$0.09/GB** for the first 10 TB, plus S3 GET request charges;
- published images are immutable and cached for a year, so each file is fetched from S3 roughly once per Bunny edge location. Origin Shield, where available, reduces that further.

Delivery is billed by Bunny: Standard tier **$0.01/GB** in Europe and North America, **$0.03/GB** in Asia and Oceania, with a **$1** monthly minimum.

Worked example: one 200 KB hero opened by 50,000 recipients in India is about 10 GB, so about $0.30 at Bunny. S3 egress for it is a few megabytes of misses.

Prices are as published in September 2026. Check the [S3 pricing page](https://aws.amazon.com/s3/pricing/) and [Bunny's CDN pricing page](https://bunny.net/pricing/cdn/).

## Not verified by anything in this repository

- AWS's own answers to these requests. Steps 3 and 6 establish them.
- Bunny's S3 Authentication against this bucket (step 3).
- That the lifecycle rule actually expires objects. AWS runs expiry asynchronously; check a day or two after step 4.
- The real Studio upload in production (canary step 1).
