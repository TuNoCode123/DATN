output "lb_ip_address" {
  description = "Static IP — point api.<domain>/web.<domain> A records at this once you're ready to cut over (spec §7), not before"
  value       = google_compute_global_address.lb_ip.address
}
