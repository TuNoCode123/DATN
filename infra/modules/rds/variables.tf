# RDS Module — Input Variables

variable "project_name" {
  description = "Name prefix for RDS resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name to create"
  type        = string
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true # Hidden in logs and terraform output
}

variable "db_instance_class" {
  description = "RDS instance type (e.g., 'db.t3.micro')"
  type        = string
  default     = "db.t3.micro"
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "Security group ID to attach to the RDS instance"
  type        = string
}
