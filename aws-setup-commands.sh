#!/bin/bash

###############################################################################
# AWS S3 Setup for BoomCard Receipt Storage
# Account ID: 443870713389
# Region: eu-west-1 (recommended for EMEA)
###############################################################################

set -e  # Exit on error

echo "🚀 Setting up AWS S3 for BoomCard Receipt Storage"
echo "Account: BoomCard (443870713389)"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

###############################################################################
# Step 1: Create S3 Bucket
###############################################################################

echo -e "${BLUE}📦 Step 1: Creating S3 Bucket${NC}"

BUCKET_NAME="boomcard-receipts-prod"
REGION="eu-west-1"

# Check if bucket already exists
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "Creating bucket: ${BUCKET_NAME}"

    # Create bucket with LocationConstraint for eu-west-1
    aws s3api create-bucket \
        --bucket ${BUCKET_NAME} \
        --region ${REGION} \
        --create-bucket-configuration LocationConstraint=${REGION}

    echo -e "${GREEN}✅ Bucket created: ${BUCKET_NAME}${NC}"
else
    echo -e "${GREEN}✅ Bucket already exists: ${BUCKET_NAME}${NC}"
fi

# Enable encryption
echo "Enabling encryption..."
aws s3api put-bucket-encryption \
    --bucket ${BUCKET_NAME} \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            },
            "BucketKeyEnabled": true
        }]
    }'

echo -e "${GREEN}✅ Encryption enabled${NC}"

# Block all public access
echo "Blocking public access..."
aws s3api put-public-access-block \
    --bucket ${BUCKET_NAME} \
    --public-access-block-configuration \
        BlockPublicAcls=true,\
        IgnorePublicAcls=true,\
        BlockPublicPolicy=true,\
        RestrictPublicBuckets=true

echo -e "${GREEN}✅ Public access blocked${NC}"

# Add bucket tagging
echo "Adding tags..."
aws s3api put-bucket-tagging \
    --bucket ${BUCKET_NAME} \
    --tagging 'TagSet=[
        {Key=Project,Value=BoomCard},
        {Key=Environment,Value=Production},
        {Key=Purpose,Value=ReceiptStorage},
        {Key=CostCenter,Value=Backend}
    ]'

echo -e "${GREEN}✅ Tags added${NC}"

###############################################################################
# Step 2: Create IAM Policy
###############################################################################

echo ""
echo -e "${BLUE}🔐 Step 2: Creating IAM Policy${NC}"

POLICY_NAME="BoomCardReceiptImagePolicy"
ACCOUNT_ID="443870713389"

# Create policy document
cat > /tmp/receipt-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReceiptImageUpload",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/receipts/*"
    },
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "receipts/*"
          ]
        }
      }
    }
  ]
}
EOF

# Check if policy already exists
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
if aws iam get-policy --policy-arn ${POLICY_ARN} 2>&1 | grep -q 'NoSuchEntity'; then
    echo "Creating IAM policy: ${POLICY_NAME}"

    POLICY_ARN=$(aws iam create-policy \
        --policy-name ${POLICY_NAME} \
        --policy-document file:///tmp/receipt-policy.json \
        --description "Allows BoomCard backend API to manage receipt images in S3" \
        --query 'Policy.Arn' \
        --output text)

    echo -e "${GREEN}✅ Policy created: ${POLICY_ARN}${NC}"
else
    echo -e "${GREEN}✅ Policy already exists: ${POLICY_ARN}${NC}"
fi

###############################################################################
# Step 3: Create IAM User
###############################################################################

echo ""
echo -e "${BLUE}👤 Step 3: Creating IAM User${NC}"

USER_NAME="boomcard-backend-api"

# Check if user already exists
if aws iam get-user --user-name ${USER_NAME} 2>&1 | grep -q 'NoSuchEntity'; then
    echo "Creating IAM user: ${USER_NAME}"

    aws iam create-user \
        --user-name ${USER_NAME} \
        --tags Key=Project,Value=BoomCard Key=Purpose,Value=BackendAPI

    echo -e "${GREEN}✅ User created: ${USER_NAME}${NC}"
else
    echo -e "${GREEN}✅ User already exists: ${USER_NAME}${NC}"
fi

# Attach policy to user
echo "Attaching policy to user..."
aws iam attach-user-policy \
    --user-name ${USER_NAME} \
    --policy-arn ${POLICY_ARN}

echo -e "${GREEN}✅ Policy attached to user${NC}"

###############################################################################
# Step 4: Create Access Keys
###############################################################################

echo ""
echo -e "${BLUE}🔑 Step 4: Creating Access Keys${NC}"

# Check if user already has access keys
EXISTING_KEYS=$(aws iam list-access-keys --user-name ${USER_NAME} --query 'AccessKeyMetadata[].AccessKeyId' --output text)

if [ -n "$EXISTING_KEYS" ]; then
    echo -e "${RED}⚠️  User already has access keys:${NC}"
    echo "$EXISTING_KEYS"
    echo ""
    echo "To create new keys, you must first delete the old ones:"
    echo "  aws iam delete-access-key --user-name ${USER_NAME} --access-key-id <OLD_KEY_ID>"
    echo ""
else
    echo "Creating access keys..."

    # Create access key and save to file
    CREDENTIALS=$(aws iam create-access-key --user-name ${USER_NAME} --output json)

    ACCESS_KEY_ID=$(echo $CREDENTIALS | jq -r '.AccessKey.AccessKeyId')
    SECRET_ACCESS_KEY=$(echo $CREDENTIALS | jq -r '.AccessKey.SecretAccessKey')

    # Save to secure file
    CREDENTIALS_FILE="${HOME}/.aws/boomcard-credentials.txt"
    cat > ${CREDENTIALS_FILE} << EOF
# BoomCard Backend API Credentials
# Created: $(date)
# User: ${USER_NAME}
# Account: 443870713389

AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}
AWS_REGION=${REGION}
AWS_S3_BUCKET=${BUCKET_NAME}
EOF

    chmod 600 ${CREDENTIALS_FILE}

    echo -e "${GREEN}✅ Access keys created!${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${RED}⚠️  IMPORTANT: Save these credentials NOW!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}"
    echo "AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}"
    echo ""
    echo "Credentials saved to: ${CREDENTIALS_FILE}"
    echo ""
fi

###############################################################################
# Step 5: Set up Lifecycle Policy (Optional)
###############################################################################

echo ""
echo -e "${BLUE}♻️  Step 5: Setting up Lifecycle Policy${NC}"

cat > /tmp/lifecycle-policy.json << 'EOF'
{
  "Rules": [
    {
      "Id": "archive-old-receipts",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "receipts/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        },
        {
          "Days": 365,
          "StorageClass": "DEEP_ARCHIVE"
        }
      ],
      "Expiration": {
        "Days": 1825
      }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
    --bucket ${BUCKET_NAME} \
    --lifecycle-configuration file:///tmp/lifecycle-policy.json

echo -e "${GREEN}✅ Lifecycle policy configured${NC}"
echo "  - After 90 days: Move to Glacier Instant Retrieval"
echo "  - After 365 days: Move to Glacier Deep Archive"
echo "  - After 1825 days (5 years): Delete permanently"

###############################################################################
# Step 6: Test Upload
###############################################################################

echo ""
echo -e "${BLUE}🧪 Step 6: Testing Upload${NC}"

# Create test file
echo "This is a test receipt image" > /tmp/test-receipt.txt

# Upload test file
aws s3 cp /tmp/test-receipt.txt s3://${BUCKET_NAME}/receipts/test/test-receipt.txt

# Verify upload
if aws s3 ls s3://${BUCKET_NAME}/receipts/test/test-receipt.txt > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Test upload successful!${NC}"

    # Clean up test file
    aws s3 rm s3://${BUCKET_NAME}/receipts/test/test-receipt.txt
    echo "Test file cleaned up"
else
    echo -e "${RED}❌ Test upload failed${NC}"
fi

# Clean up temp files
rm -f /tmp/receipt-policy.json /tmp/lifecycle-policy.json /tmp/test-receipt.txt

###############################################################################
# Summary
###############################################################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "S3 Bucket: ${BUCKET_NAME}"
echo "Region: ${REGION}"
echo "IAM User: ${USER_NAME}"
echo "Policy: ${POLICY_NAME}"
echo ""
echo "Next Steps:"
echo "1. Update backend-api/.env with the credentials above"
echo "2. Restart your backend server"
echo "3. Test receipt upload via API: POST /api/receipts/v2/upload"
echo ""
echo "View bucket contents:"
echo "  aws s3 ls s3://${BUCKET_NAME}/receipts/ --recursive --human-readable"
echo ""
echo "Monitor costs:"
echo "  https://console.aws.amazon.com/cost-management/home#/cost-explorer"
echo ""
