#!/usr/bin/env bash
# Compare the live AWS setup with the files in this folder. READ-ONLY: every
# command is a get/list; nothing is created, changed or deleted, and no access
# key is listed or printed.
#
#   BUNNY_USER=<Bunny's read-only IAM user> docs/asset-storage/verify-live-config.sh
#
# Needs the AWS CLI with an identity allowed to read the bucket's configuration
# and the two users' policies. A difference is printed as a diff; "matches"
# means the live document and the file are the same once key order, list order
# and single-value-versus-list are ignored.
set -uo pipefail
BUCKET="${BUCKET:-joon-assets-production-632404568116-eu-north-1-an}"
API_USER="${API_USER:-joon-assets-api-production}"
BUNNY_USER="${BUNNY_USER:?set BUNNY_USER to the name of Bunny\'s read-only IAM user}"
DIR="$(cd "$(dirname "$0")" && pwd)"

normalise() {
  python3 -c '
import json, sys
def norm(value):
    if isinstance(value, dict):
        return {key: norm(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return sorted((norm(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
    return value
doc = json.load(sys.stdin)
for statement in doc.get("Statement", []) if isinstance(doc, dict) else []:
    for field in ("Action", "Resource"):
        if isinstance(statement.get(field), str):
            statement[field] = [statement[field]]
print(json.dumps(norm(doc), indent=2, sort_keys=True))'
}

compare() { # $1 label, $2 live json, $3 repo file
  if diff <(printf '%s' "$2" | normalise) <(normalise < "$3") > /tmp/joon-verify.diff; then
    echo "  matches $(basename "$3")"
  else
    echo "  DIFFERS from $(basename "$3") (live first):"; sed 's/^/    /' /tmp/joon-verify.diff
  fi
}

echo "== bucket $BUCKET"
aws s3api get-bucket-versioning --bucket "$BUCKET" --output json
aws s3api get-public-access-block --bucket "$BUCKET" --query PublicAccessBlockConfiguration --output json
aws s3api get-bucket-policy --bucket "$BUCKET" --output text 2>&1 | sed 's/^/  bucket policy: /' | head -3
echo "== CORS"
compare cors "$(aws s3api get-bucket-cors --bucket "$BUCKET" --output json)" "$DIR/s3-cors.json"
echo "== lifecycle"
compare lifecycle "$(aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" --output json)" "$DIR/s3-lifecycle.json"

for pair in "$API_USER:iam-joon-api.json" "$BUNNY_USER:iam-bunny-read.json"; do
  user="${pair%%:*}"; file="${pair#*:}"
  echo "== IAM user $user (expected: $file)"
  echo "  groups: $(aws iam list-groups-for-user --user-name "$user" --query 'Groups[].GroupName' --output text)"
  for name in $(aws iam list-user-policies --user-name "$user" --query 'PolicyNames[]' --output text); do
    echo "  inline policy $name:"
    compare inline "$(aws iam get-user-policy --user-name "$user" --policy-name "$name" --query PolicyDocument --output json)" "$DIR/$file"
  done
  for arn in $(aws iam list-attached-user-policies --user-name "$user" --query 'AttachedPolicies[].PolicyArn' --output text); do
    version="$(aws iam get-policy --policy-arn "$arn" --query Policy.DefaultVersionId --output text)"
    echo "  attached policy $arn ($version):"
    compare managed "$(aws iam get-policy-version --policy-arn "$arn" --version-id "$version" --query PolicyVersion.Document --output json)" "$DIR/$file"
  done
done
