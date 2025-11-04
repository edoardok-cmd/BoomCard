# AWS S3 Setup Guide for Receipt Image Storage

**AWS Account:** BoomCard
**Account ID:** 443870713389
**Region:** eu-west-1 (Ireland - recommended for EMEA)

---

## 📋 Prerequisites

- AWS Account: ✓ BoomCard (443870713389)
- AWS Console Access: Required
- IAM Permissions: Required to create buckets and users

---

## 🪣 Step 1: Create S3 Bucket

### Via AWS Console:

1. **Navigate to S3:**
   - Go to https://console.aws.amazon.com/s3/
   - Sign in to AWS Account: BoomCard (443870713389)

2. **Create Bucket:**
   - Click "Create bucket"
   - **Bucket name:** `boom-receipts-prod` (must be globally unique)
     - Alternative: `boomcard-receipts-443870713389`
   - **AWS Region:** `EU (Ireland) eu-west-1`
   - **Object Ownership:** ACLs disabled (recommended)
   - **Block Public Access:** ✓ Keep all 4 checkboxes checked (receipts are private)
   - **Bucket Versioning:** Disabled (optional: enable for backup)
   - **Default encryption:** Enable with SSE-S3
   - Click "Create bucket"

### Via AWS CLI:

```bash
# Install AWS CLI if not already installed
# brew install awscli  # macOS
# Or download from: https://aws.amazon.com/cli/

# Configure AWS CLI with your credentials
aws configure
# AWS Access Key ID: [Enter your key]
# AWS Secret Access Key: [Enter your secret]
# Default region name: eu-west-1
# Default output format: json

# Create bucket
aws s3api create-bucket \
  --bucket boom-receipts-prod \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket boom-receipts-prod \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket boom-receipts-prod \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
    IgnorePublicAcls=true,\
    BlockPublicPolicy=true,\
    RestrictPublicBuckets=true
```

---

## 👤 Step 2: Create IAM User for Backend API

### Via AWS Console:

1. **Navigate to IAM:**
   - Go to https://console.aws.amazon.com/iam/
   - Click "Users" → "Create user"

2. **User Details:**
   - **User name:** `boomcard-backend-api`
   - ✓ Provide user access to the AWS Management Console: NO
   - Click "Next"

3. **Set Permissions:**
   - Select "Attach policies directly"
   - Click "Create policy" → JSON tab
   - Paste the following policy:

```json
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
      "Resource": "arn:aws:s3:::boom-receipts-prod/receipts/*"
    },
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::boom-receipts-prod"
    }
  ]
}
```

4. **Save Policy:**
   - **Policy name:** `BoomCardReceiptImagePolicy`
   - **Description:** "Allows backend API to upload/download/delete receipt images"
   - Click "Create policy"

5. **Attach Policy to User:**
   - Go back to user creation
   - Search for `BoomCardReceiptImagePolicy`
   - ✓ Select the policy
   - Click "Next"
   - Click "Create user"

6. **Create Access Keys:**
   - Click on the newly created user: `boomcard-backend-api`
   - Go to "Security credentials" tab
   - Scroll to "Access keys"
   - Click "Create access key"
   - Select "Application running on an AWS compute service"
   - Click "Next"
   - **Description:** "BoomCard Backend API Production"
   - Click "Create access key"
   - ⚠️ **IMPORTANT:** Download the CSV file or copy the credentials NOW
     - Access Key ID: `AKIA...` (20 characters)
     - Secret Access Key: `...` (40 characters)
   - **You won't be able to see the secret key again!**

### Via AWS CLI:

```bash
# Create IAM user
aws iam create-user --user-name boomcard-backend-api

# Create policy
cat > receipt-image-policy.json << 'EOF'
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
      "Resource": "arn:aws:s3:::boom-receipts-prod/receipts/*"
    },
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::boom-receipts-prod"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name BoomCardReceiptImagePolicy \
  --policy-document file://receipt-image-policy.json

# Attach policy to user
aws iam attach-user-policy \
  --user-name boomcard-backend-api \
  --policy-arn arn:aws:iam::443870713389:policy/BoomCardReceiptImagePolicy

# Create access key
aws iam create-access-key --user-name boomcard-backend-api
# Save the AccessKeyId and SecretAccessKey from the output
```

---

## 🔐 Step 3: Configure Backend Environment Variables

Update your `backend-api/.env` file with the actual AWS credentials:

```bash
# AWS S3 Configuration (for receipt image storage)
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=AKIA****************  # Replace with your actual key
AWS_SECRET_ACCESS_KEY=****************************************  # Replace with your actual secret
AWS_S3_BUCKET=boom-receipts-prod

# Alternative: CloudFlare R2 (if you prefer)
# R2_ACCOUNT_ID=your_r2_account_id_here
# R2_ACCESS_KEY_ID=your_r2_access_key_here
# R2_SECRET_ACCESS_KEY=your_r2_secret_key_here
# R2_BUCKET_NAME=boom-receipts
```

⚠️ **Security Note:** Never commit `.env` file to Git! Add it to `.gitignore`.

---

## 🧪 Step 4: Test the Setup

### Test 1: Upload a Test Image

```bash
# Using AWS CLI
echo "Test receipt image" > test-receipt.txt
aws s3 cp test-receipt.txt s3://boom-receipts-prod/receipts/test/test-receipt.txt

# Check if uploaded
aws s3 ls s3://boom-receipts-prod/receipts/test/

# Clean up test
aws s3 rm s3://boom-receipts-prod/receipts/test/test-receipt.txt
```

### Test 2: Test Backend API Upload

Create a test script: `backend-api/test-s3-upload.ts`

```typescript
import { imageUploadService } from './src/services/imageUpload.service';
import * as fs from 'fs';
import * as path from 'path';

async function testUpload() {
  try {
    // Create a test file
    const testImagePath = path.join(__dirname, 'test-receipt.jpg');

    // Simulate multer file object
    const mockFile: Express.Multer.File = {
      fieldname: 'receipt',
      originalname: 'test-receipt.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: fs.readFileSync(testImagePath),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    console.log('🧪 Testing S3 upload...');
    const result = await imageUploadService.uploadReceipt(mockFile, 'test-user-123');

    console.log('✅ Upload successful!');
    console.log('URL:', result.url);
    console.log('Key:', result.key);
    console.log('Hash:', result.hash);

  } catch (error) {
    console.error('❌ Upload failed:', error);
  }
}

testUpload();
```

Run the test:
```bash
cd backend-api
npx ts-node test-s3-upload.ts
```

### Test 3: Test via API Endpoint

```bash
# Upload receipt via API
curl -X POST http://localhost:3001/api/receipts/v2/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "receipt=@/path/to/test-receipt.jpg"
```

Expected response:
```json
{
  "url": "https://boom-receipts-prod.s3.eu-west-1.amazonaws.com/receipts/user-123/abc-def-ghi.jpg",
  "key": "receipts/user-123/abc-def-ghi.jpg",
  "hash": "a1b2c3d4e5f6..."
}
```

---

## 📊 Step 5: Set Up S3 Bucket Lifecycle Rules (Optional)

To manage storage costs, set up lifecycle rules to archive or delete old receipts:

### Via AWS Console:

1. Go to S3 → Select `boom-receipts-prod`
2. Click "Management" tab → "Create lifecycle rule"
3. **Rule name:** `archive-old-receipts`
4. **Rule scope:** Apply to all objects in the bucket
5. **Lifecycle rule actions:**
   - ✓ Move current versions of objects between storage classes
   - ✓ Expire current versions of objects
6. **Transition actions:**
   - After 90 days → Transition to S3 Glacier Instant Retrieval
   - After 365 days → Transition to S3 Glacier Deep Archive
7. **Expiration:**
   - After 1825 days (5 years) → Permanently delete objects
8. Click "Create rule"

### Via AWS CLI:

```bash
cat > lifecycle-policy.json << 'EOF'
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
  --bucket boom-receipts-prod \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

## 💰 Cost Estimation

### S3 Storage Costs (eu-west-1):

**Assumptions:**
- 1,000 receipts/day
- Average receipt image: 500 KB (after optimization with Sharp)
- Storage class: S3 Standard → Glacier IR → Deep Archive

**Monthly Storage:**
- Daily: 1,000 × 500 KB = 500 MB
- Monthly: 500 MB × 30 = 15 GB
- Yearly: 15 GB × 12 = 180 GB

**Costs:**
- First 90 days (S3 Standard): 15 GB × 3 × $0.023/GB = **$1.04**
- 90-365 days (Glacier IR): 165 GB × $0.004/GB = **$0.66**
- 365+ days (Deep Archive): Minimal (old receipts)

**Data Transfer:**
- Uploads (PUT): 30,000/month × $0.005/1000 = **$0.15**
- Downloads (GET): Presigned URLs, ~10% retrieved = **$0.08**

**Total Monthly Cost:** ~$2.00 USD/month for 1,000 receipts/day

### Cost Optimization Tips:

1. **Use Sharp compression** (already implemented) - reduces image size by 50-70%
2. **Implement lifecycle rules** - archive old receipts to Glacier
3. **Use CloudFlare R2** - No egress fees (S3 charges $0.09/GB for downloads)
4. **Delete rejected receipts** - after 30 days to save storage

---

## 🔒 Security Best Practices

### ✅ Implemented:
- ✓ Private bucket (no public access)
- ✓ Encryption at rest (SSE-S3)
- ✓ IAM user with minimal permissions
- ✓ Presigned URLs for secure access

### 🔐 Additional Recommendations:

1. **Enable S3 Access Logging:**
```bash
aws s3api put-bucket-logging \
  --bucket boom-receipts-prod \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "boom-receipts-logs",
      "TargetPrefix": "access-logs/"
    }
  }'
```

2. **Enable CloudTrail for S3 API calls:**
   - Go to CloudTrail → Create trail
   - Track S3 data events for audit

3. **Set up CloudWatch Alarms:**
   - Alert on unusually high PUT/GET requests
   - Alert on large data transfers

4. **Rotate Access Keys:**
   - Rotate IAM access keys every 90 days
   - Use AWS Secrets Manager for production

5. **Enable MFA Delete:**
```bash
aws s3api put-bucket-versioning \
  --bucket boom-receipts-prod \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::443870713389:mfa/root-account-mfa-device XXXXXX"
```

---

## 🚨 Troubleshooting

### Error: "Access Denied"

**Cause:** IAM user doesn't have permissions
**Solution:** Check IAM policy is attached correctly

```bash
# Verify policy attachment
aws iam list-attached-user-policies --user-name boomcard-backend-api

# Check policy permissions
aws iam get-policy-version \
  --policy-arn arn:aws:iam::443870713389:policy/BoomCardReceiptImagePolicy \
  --version-id v1
```

### Error: "The specified bucket does not exist"

**Cause:** Bucket name mismatch or wrong region
**Solution:** Verify bucket name and region in `.env`

```bash
# List all buckets
aws s3 ls

# Check bucket region
aws s3api get-bucket-location --bucket boom-receipts-prod
```

### Error: "SignatureDoesNotMatch"

**Cause:** Invalid AWS credentials
**Solution:** Verify access key and secret key

```bash
# Test credentials
aws sts get-caller-identity

# Output should show:
# Account: 443870713389
# UserId: AIDA...
# Arn: arn:aws:iam::443870713389:user/boomcard-backend-api
```

### Error: "RequestTimeTooSkewed"

**Cause:** System time is incorrect
**Solution:** Sync system time

```bash
# macOS
sudo sntp -sS time.apple.com

# Linux
sudo ntpdate -s time.nist.gov
```

---

## 📖 Additional Resources

- **AWS S3 Documentation:** https://docs.aws.amazon.com/s3/
- **AWS IAM Best Practices:** https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- **S3 Pricing Calculator:** https://calculator.aws/
- **Sharp Image Optimization:** https://sharp.pixelplumbing.com/

---

## ✅ Setup Checklist

- [ ] S3 bucket created: `boom-receipts-prod`
- [ ] Bucket region: `eu-west-1`
- [ ] Block public access enabled
- [ ] Encryption enabled (SSE-S3)
- [ ] IAM user created: `boomcard-backend-api`
- [ ] IAM policy attached: `BoomCardReceiptImagePolicy`
- [ ] Access keys created and saved securely
- [ ] `.env` file updated with AWS credentials
- [ ] Test upload successful via AWS CLI
- [ ] Test upload successful via backend API
- [ ] Lifecycle rules configured (optional)
- [ ] Monitoring/logging enabled (optional)

---

## 🎉 Ready to Go!

Once you've completed the checklist above, your receipt image storage system is fully operational!

**Next Steps:**
1. Test the complete receipt submission flow (upload → OCR → fraud detection)
2. Monitor S3 costs in AWS Cost Explorer
3. Set up CloudWatch alarms for unusual activity
4. Implement backup strategy for critical receipts

---

**Last Updated:** November 4, 2025
**AWS Account:** BoomCard (443870713389)
**Support:** Check AWS Console or contact AWS Support
