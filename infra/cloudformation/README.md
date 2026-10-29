# OmniHack on AWS (CloudFormation, lean)

`omnihack.yaml` provisions the whole application in one stack (`omnihack`, us-east-1):

| Piece       | Resource                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Public URL  | `https://www.omnihack.tech` → internet-facing ALB (ACM certificate, TLS 1.3 policy; HTTP redirects)      |
| App         | ECS Fargate service `web` (0.5 vCPU / 1 GB), one task; the worker runs in-process                        |
| Database    | RDS PostgreSQL 17, db.t4g.micro, single-AZ, encrypted, 7-day PITR, deletion protection, isolated subnets |
| Files       | Private, versioned S3 bucket (`STORAGE_DRIVER=s3`, task-role credentials)                                |
| Image build | ECR repository + CodeBuild project (no local Docker needed)                                              |
| Secrets     | Secrets Manager generates the DB password, `APP_SECRET` and `ENCRYPTION_KEY`; holds `RESEND_API_KEY`     |

Migrations run on container start (`MIGRATE_ON_START=true`). `scripts/start.sh` assembles `DATABASE_URL`
from `DB_*` variables so the password is injected from Secrets Manager, not written in the task definition.

Rough cost: ~$40–65/month (RDS micro, ALB, one Fargate task, public IPv4 addresses).

CloudFront is not used yet: the account must first be verified for CloudFront by AWS Support.

## First deployment

DNS for omnihack.tech is hosted at GoDaddy, so the certificate is requested and validated outside the stack.

```powershell
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com   # once per account

# 0. Certificate: add the validation CNAME it prints to GoDaddy, wait for Status=ISSUED
aws acm request-certificate --region us-east-1 --domain-name www.omnihack.tech --validation-method DNS
aws acm describe-certificate --region us-east-1 --certificate-arn <arn> --query "Certificate.[Status,DomainValidationOptions[0].ResourceRecord]"

# 1. Platform without app tasks
aws cloudformation deploy --region us-east-1 --stack-name omnihack --template-file infra/cloudformation/omnihack.yaml `
  --capabilities CAPABILITY_IAM --parameter-overrides DesiredCount=0 ImageTag=none CertificateArn=<arn>
```

Then follow "Releasing a new version" with `DesiredCount=1`. Finally, in GoDaddy point the `www` CNAME at
the `LoadBalancerDnsName` output.

## Releasing a new version

```powershell
$out = aws cloudformation describe-stacks --region us-east-1 --stack-name omnihack --query "Stacks[0].Outputs" | ConvertFrom-Json
$bucket = ($out | ? OutputKey -eq BuildBucketName).OutputValue
$project = ($out | ? OutputKey -eq BuildProjectName).OutputValue
$tag = "$(git rev-parse --short HEAD)-$(Get-Date -Format yyyyMMddHHmm)"

# Package the working tree (tracked + untracked, not ignored; never .env)
git ls-files -co --exclude-standard | ? { $_ -notmatch '^\.env($|\.)' -or $_ -eq '.env.example' } | Set-Content -Encoding ascii files.txt
tar -a -c -f omnihack-src.zip -T files.txt
aws s3 cp omnihack-src.zip "s3://$bucket/source/omnihack-src.zip"

# Build and push (about 8–12 minutes); wait until the build reports SUCCEEDED
aws codebuild start-build --region us-east-1 --project-name $project `
  --environment-variables-override "name=IMAGE_TAG,value=$tag,type=PLAINTEXT"

# Roll out (ECS circuit breaker rolls back automatically if the new task fails health checks)
aws cloudformation deploy --region us-east-1 --stack-name omnihack --template-file infra/cloudformation/omnihack.yaml `
  --capabilities CAPABILITY_IAM --parameter-overrides DesiredCount=1 ImageTag=$tag
```

(`deploy` keeps `CertificateArn` and the other parameters from the previous deployment.)

### Building without CodeBuild

New accounts start with a CodeBuild concurrency quota of 0 ("Cannot have more than 0 builds in queue").
Request an increase for "Concurrently running builds for Linux/Medium environment" in Service Quotas, or
run the same build on a self-terminating EC2 instance using the stack's `BuilderInstanceProfileName`,
`BuilderSecurityGroupId` and a `PublicSubnetIds` subnet:

```powershell
aws ec2 run-instances --region us-east-1 --instance-type t3.large `
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 `
  --iam-instance-profile Name=<BuilderInstanceProfileName> `
  --network-interfaces "DeviceIndex=0,SubnetId=<subnet>,Groups=<BuilderSecurityGroupId>,AssociatePublicIpAddress=true" `
  --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true}" `
  --metadata-options HttpTokens=required --instance-initiated-shutdown-behavior terminate --user-data file://userdata.sh
```

`userdata.sh` installs Docker, downloads `source/omnihack-src.zip`, applies the same Dockerfile `sed` as the
buildspec, logs in to ECR, builds and pushes `<RepositoryUri>:<tag>`, then shuts down (which terminates the
instance). Wait until the tag appears in `aws ecr describe-images`, then roll out as above.

On slow uplinks, leave `docs/`, `design/`, `tests/`, `infra/` and `.github/` out of the zip; the image does
not use them.

## Operations

- Logs: CloudWatch `/ecs/omnihack` (app) and `/codebuild/omnihack` (builds).
- Email uses `EMAIL_PROVIDER=resend` from `no-reply@omnihack.tech` (parameter `EmailFromAddress`); the
  `omnihack.tech` domain must stay verified in Resend (DKIM/SPF records in DNS). The Resend "sending access"
  key is the `ResendApiKey` stack parameter (NoEcho), stored as the `ResendApiKeySecret` secret; pass
  `ResendApiKey=re_...` once and later `deploy` runs keep it. To rotate it, deploy with a new value. Delivery status and errors are visible under **Admin → System**
  (email outbox).
- Promote a user to super admin (one-off task; the DB is not reachable from outside the VPC):

  ```powershell
  $email = "you@example.com"
  $cmd = "export DATABASE_URL=postgresql://`$DB_USER:`$DB_PASSWORD@`$DB_HOST:`$DB_PORT/`$DB_NAME?sslmode=require; " +
         "node -e `"const{PrismaClient}=require('@prisma/client');new PrismaClient().user.update({where:{email:'$email'},data:{platformRole:'SUPER_ADMIN'}}).then(u=>console.log('promoted',u.email))`""
  # run with: aws ecs run-task --cluster <ClusterName> --task-definition <WebTaskDefinitionArn> --launch-type FARGATE
  #   --network-configuration awsvpcConfiguration={subnets=[<PublicSubnetIds>],securityGroups=[<AppSecurityGroupId>],assignPublicIp=ENABLED}
  #   --overrides containerOverrides=[{name=web,command=[sh,-c,$cmd]}]
  ```

- Deleting the stack: RDS has deletion protection and takes a final snapshot; the files bucket and
  `ENCRYPTION_KEY` secret are retained. Disable deletion protection first if you really mean to delete.

## Moving towards production

CloudFront with WAF in front of the ALB (once the account is verified for CloudFront), Multi-AZ RDS,
private subnets with NAT, a separate worker service (`RUN_WORKER_IN_PROCESS=false`) before running more
than one web task, and ClamAV scanning. `infra/terraform` describes that target design.
