#!/bin/bash
# Task Discovery Script fuer NodePulse
# Sammelt: Proxmox Task History
# Output: JSON

set -e

hostname=$(hostname)

# Use python for proper JSON handling
python3 << 'PYTHON_SCRIPT'
import json
import subprocess
import sys

result = {
    "tasks": [],
    "running": []
}

def run_pvesh(cmd):
    try:
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        if proc.returncode == 0 and proc.stdout.strip():
            return json.loads(proc.stdout)
    except:
        pass
    return []

# Get hostname
import socket
hostname = socket.gethostname()

# Get recent tasks (last 200)
tasks = run_pvesh(f'pvesh get "/nodes/{hostname}/tasks" --limit 200 --output-format json')

for t in tasks:
    task = {
        "upid": t.get("upid", ""),
        "node": t.get("node", ""),
        "type": t.get("type", ""),
        "id": None,
        "user": t.get("user", ""),
        "status": t.get("status", ""),
        "exitstatus": t.get("exitstatus", "") or "",
        "starttime": t.get("starttime", 0) or 0,
        "endtime": t.get("endtime", 0) or 0,
        "pid": t.get("pid", 0) or 0,
        "pstart": t.get("pstart", 0) or 0
    }

    # Convert vmid to int or None
    vmid = t.get("id", "")
    if vmid and vmid != "":
        try:
            task["id"] = int(vmid)
        except:
            pass

    result["tasks"].append(task)

# Get running tasks from cluster
running = run_pvesh('pvesh get "/cluster/tasks" --output-format json')

for t in running:
    # Filter only running tasks
    if t.get("status") != "running" and t.get("endtime"):
        continue

    task = {
        "upid": t.get("upid", ""),
        "node": t.get("node", ""),
        "type": t.get("type", ""),
        "id": None,
        "user": t.get("user", ""),
        "status": "running",
        "starttime": t.get("starttime", 0) or 0,
        "pid": t.get("pid", 0) or 0,
        "pstart": t.get("pstart", 0) or 0
    }

    vmid = t.get("id", "")
    if vmid and vmid != "":
        try:
            task["id"] = int(vmid)
        except:
            pass

    result["running"].append(task)

# Output valid JSON
print(json.dumps(result))
PYTHON_SCRIPT
