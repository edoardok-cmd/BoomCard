require('dotenv').config({ path: '.env' });
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testS3() {
  try {
    console.log('🔍 Testing S3 connection...');
    console.log(`Region: ${process.env.AWS_REGION}`);
    console.log(`Bucket: ${process.env.AWS_S3_BUCKET}`);

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: 'test/test.txt',
      Body: 'Hello from BoomCard!',
    });

    await s3Client.send(command);
    console.log('✅ S3 connection successful!');
    console.log('✅ Test file uploaded to test/test.txt');
  } catch (error) {
    console.error('❌ S3 connection failed:', error.message);
    process.exit(1);
  }
}

testS3();
