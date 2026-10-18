'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EVIDENCE_DIR = path.join(__dirname, '..', 'docs', 'evidence', 'buoi9');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '') + (err.message || '');
  }
}

console.log('Generating Buoi 9 evidence files in:', EVIDENCE_DIR);

// 1. Docker Compose PS
console.log('Capturing 01-docker-compose-ps.txt...');
const psOut = runCmd('docker compose ps');
fs.writeFileSync(path.join(EVIDENCE_DIR, '01-docker-compose-ps.txt'), psOut, 'utf8');

// 2. Healthcheck Verification
console.log('Capturing 02-minio-healthcheck.txt...');
const imageOut = runCmd("docker inspect --format='{{.Config.Image}}' minio-demo-buoi9-minio-1");
const mcVerOut = runCmd('docker compose exec -T minio mc --version');
const healthOut = runCmd("docker inspect --format='{{json .State.Health}}' minio-demo-buoi9-minio-1");
const healthDoc = [
  '============================================================',
  'MinIO Healthcheck Verification (Pinned Digest & /usr/bin/mc)',
  '============================================================',
  `Timestamp: ${new Date().toISOString()}`,
  '',
  '[1] Pinned Image:',
  imageOut.trim(),
  '',
  '[2] mc Binary Version inside Container:',
  mcVerOut.trim(),
  '',
  '[3] Docker Container Health Status:',
  healthOut.trim(),
  '',
  '[4] Manual mc ready local execution check:',
  runCmd('docker compose exec -T minio mc ready local').trim(),
].join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '02-minio-healthcheck.txt'), healthDoc, 'utf8');

// 3. Service Account Least Privilege Verification
console.log('Capturing 03-service-account-verification.txt...');
const svcInfoOut = runCmd('docker compose exec -T minio mc admin user svcacct info minioadmin buoi9_app_svc');
const blockMbOut = runCmd('docker compose exec -T minio mc mb testsvc/hacked-bucket');
const blockAdminOut = runCmd('docker compose exec -T minio mc admin user ls testsvc');
const missingCredsOut = runCmd('docker compose run --rm -e MINIO_ACCESS_KEY="" -e MINIO_SECRET_KEY="" backend-1 node -e "require(\'./src/config/minio\')"');
const svcDoc = [
  '============================================================',
  'MinIO Service Account Security & Least Privilege Verification',
  '============================================================',
  `Timestamp: ${new Date().toISOString()}`,
  '',
  '[1] Service Account Metadata & Status (buoi9_app_svc):',
  svcInfoOut.trim(),
  '',
  '[2] Blocked Action: Attempt to makeBucket with Service Account (Must be Access Denied):',
  blockMbOut.trim(),
  '',
  '[3] Blocked Action: Attempt to list users/admins with Service Account (Must be Access Denied):',
  blockAdminOut.trim(),
  '',
  '[4] Configuration Hardening: Missing Backend Credentials (Must Throw Error & Refuse Startup):',
  missingCredsOut.trim(),
].join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '03-service-account-verification.txt'), svcDoc, 'utf8');

// 4. Backend Startup Logs
console.log('Capturing 04-backend-startup-logs.txt...');
const backend1Logs = runCmd('docker compose logs --tail=40 backend-1');
const backend2Logs = runCmd('docker compose logs --tail=40 backend-2');
const backendLogsDoc = [
  '============================================================',
  'Backend Startup Logs (Least-Privilege Service Account Verified)',
  '============================================================',
  `Timestamp: ${new Date().toISOString()}`,
  '',
  '--- backend-1 logs ---',
  backend1Logs.trim(),
  '',
  '--- backend-2 logs ---',
  backend2Logs.trim(),
].join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '04-backend-startup-logs.txt'), backendLogsDoc, 'utf8');

// 5. Hardening E2E Test Suite Run
console.log('Capturing 05-e2e-hardening-test.txt...');
const e2eOut = runCmd('node scripts/test-buoi9-hardening.js');
fs.writeFileSync(path.join(EVIDENCE_DIR, '05-e2e-hardening-test.txt'), e2eOut, 'utf8');

// 6. Anonymous Policy Verification
console.log('Capturing 06-anonymous-policy-test.txt...');
const curlPublic = runCmd('curl.exe -i -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/public/1792345361561-public-announcement-1511.txt');
const curlPrivate = runCmd('curl.exe -i -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/private/test.txt');
const curlList = runCmd('curl.exe -i -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/');
const anonDoc = [
  '============================================================',
  'Anonymous Access Policy Verification via minio.shop.local',
  '============================================================',
  `Timestamp: ${new Date().toISOString()}`,
  '',
  '[1] Anonymous GET public prefix (Must return HTTP 200 OK):',
  curlPublic.trim(),
  '',
  '[2] Anonymous GET private prefix (Must return HTTP 403 Forbidden):',
  curlPrivate.trim(),
  '',
  '[3] Anonymous GET / (ListBucket) (Must return HTTP 403 Forbidden):',
  curlList.trim(),
].join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '06-anonymous-policy-test.txt'), anonDoc, 'utf8');

// 7. Frontend Build Log
console.log('Capturing 07-frontend-build.txt...');
const feBuild = runCmd('npm --prefix frontend run build');
fs.writeFileSync(path.join(EVIDENCE_DIR, '07-frontend-build.txt'), feBuild, 'utf8');

console.log('All Buoi 9 evidence files generated successfully in docs/evidence/buoi9/!');
