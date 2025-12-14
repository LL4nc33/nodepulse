-- =====================================================
-- nodepulse Seed Data
-- =====================================================

-- Default Settings
INSERT OR IGNORE INTO settings (key, value) VALUES
('auto_discovery_enabled', 'true'),
('rediscovery_on_connect', 'true'),
('monitoring_default_interval', '30'),
('stats_retention_hours', '168'),
('alert_cpu_warning', '80'),
('alert_cpu_critical', '95'),
('alert_ram_warning', '85'),
('alert_ram_critical', '95'),
('alert_disk_warning', '80'),
('alert_disk_critical', '95'),
('alert_temp_warning', '70'),
('alert_temp_critical', '85');

-- System Tags (auto-generated)
INSERT OR IGNORE INTO tags (name, tag_type, color, description) VALUES
('bare-metal', 'system', '#4a5568', 'Physical server, no virtualization'),
('vm', 'system', '#805ad5', 'Virtual machine'),
('container', 'system', '#38a169', 'LXC container'),
('proxmox', 'system', '#e6522c', 'Proxmox VE host'),
('cluster-node', 'system', '#dd6b20', 'Part of Proxmox cluster'),
('standalone', 'system', '#718096', 'Standalone Proxmox (no cluster)'),
('proxmox-vm', 'system', '#9f7aea', 'VM running on Proxmox'),
('proxmox-ct', 'system', '#48bb78', 'LXC container on Proxmox'),
('docker', 'system', '#2496ed', 'Docker installed'),
('podman', 'system', '#892ca0', 'Podman installed'),
('raspberry-pi', 'system', '#c51a4a', 'Raspberry Pi hardware'),
('x86', 'system', '#3182ce', 'x86_64 architecture'),
('arm', 'system', '#d69e2e', 'ARM architecture');

-- Command Templates
INSERT OR IGNORE INTO command_templates (name, description, category, node_types, template, requires_param, dangerous, sort_order) VALUES
-- System Commands
('System Update', 'Update package lists and upgrade', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'apt update && apt upgrade -y', NULL, 1, 1),
('Reboot', 'Reboot the system', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'reboot', NULL, 1, 2),
('Shutdown', 'Shutdown the system', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'shutdown now', NULL, 1, 3),
('Disk Usage', 'Show disk usage', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'df -h', NULL, 0, 4),
('Memory Usage', 'Show memory usage', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'free -h', NULL, 0, 5),
('Service Status', 'Check systemd service status', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'systemctl status {service}', 'service', 0, 6),
('Service Restart', 'Restart systemd service', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'systemctl restart {service}', 'service', 1, 7),
('Service Logs', 'Show service logs', 'system', 'bare-metal,proxmox-host,proxmox-vm,proxmox-ct,docker-host,raspberry-pi', 'journalctl -u {service} --no-pager -n 100', 'service', 0, 8),

-- Docker Commands
('Docker PS', 'List all containers', 'docker', 'docker-host', 'docker ps -a', NULL, 0, 10),
('Docker Stats', 'Show container stats', 'docker', 'docker-host', 'docker stats --no-stream', NULL, 0, 11),
('Docker Restart Container', 'Restart a container', 'docker', 'docker-host', 'docker restart {container}', 'container', 0, 12),
('Docker Stop Container', 'Stop a container', 'docker', 'docker-host', 'docker stop {container}', 'container', 0, 13),
('Docker Start Container', 'Start a container', 'docker', 'docker-host', 'docker start {container}', 'container', 0, 14),
('Docker Logs', 'Show container logs', 'docker', 'docker-host', 'docker logs {container} --tail 100', 'container', 0, 15),
('Docker System Prune', 'Clean up unused Docker resources', 'docker', 'docker-host', 'docker system prune -f', NULL, 1, 16),
('Docker Image Prune', 'Remove unused images', 'docker', 'docker-host', 'docker image prune -a -f', NULL, 1, 17),
('Docker Volume Prune', 'Remove unused volumes', 'docker', 'docker-host', 'docker volume prune -f', NULL, 1, 18),

-- Proxmox Commands
('PVE VM List', 'List all VMs', 'proxmox', 'proxmox-host', 'qm list', NULL, 0, 20),
('PVE CT List', 'List all containers', 'proxmox', 'proxmox-host', 'pct list', NULL, 0, 21),
('PVE Start VM', 'Start a VM', 'proxmox', 'proxmox-host', 'qm start {vmid}', 'vmid', 0, 22),
('PVE Stop VM', 'Stop a VM', 'proxmox', 'proxmox-host', 'qm stop {vmid}', 'vmid', 1, 23),
('PVE Shutdown VM', 'Graceful shutdown VM', 'proxmox', 'proxmox-host', 'qm shutdown {vmid}', 'vmid', 0, 24),
('PVE Start CT', 'Start a container', 'proxmox', 'proxmox-host', 'pct start {ctid}', 'ctid', 0, 25),
('PVE Stop CT', 'Stop a container', 'proxmox', 'proxmox-host', 'pct stop {ctid}', 'ctid', 1, 26),
('PVE Shutdown CT', 'Graceful shutdown container', 'proxmox', 'proxmox-host', 'pct shutdown {ctid}', 'ctid', 0, 27),
('PVE Create Snapshot', 'Create VM snapshot', 'proxmox', 'proxmox-host', 'qm snapshot {vmid} {snapname}', 'vmid,snapname', 0, 28),
('PVE Cluster Status', 'Show cluster status', 'proxmox', 'proxmox-host', 'pvecm status', NULL, 0, 29),
('PVE Storage Status', 'Show storage status', 'proxmox', 'proxmox-host', 'pvesm status', NULL, 0, 30);
