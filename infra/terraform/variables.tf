variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "environment" {
  type        = string
  description = "staging or production"
}
variable "app_url" {
  type        = string
  description = "Public base URL, e.g. https://omnihack.example"
}
variable "image_tag" {
  type = string
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "web_count" {
  type    = number
  default = 2
}
variable "acm_certificate_arn" {
  type        = string
  description = "Regional ACM certificate for the ALB"
}
variable "cloudfront_certificate_arn" {
  type        = string
  description = "us-east-1 ACM certificate for CloudFront"
}
variable "domain_aliases" {
  type    = list(string)
  default = []
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}
output "ecr_repository" {
  value = aws_ecr_repository.app.repository_url
}
output "files_bucket" {
  value = aws_s3_bucket.files.bucket
}
