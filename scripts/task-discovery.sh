#!/bin/bash
# Task Discovery Script fuer NodePulse
# Sammelt: Proxmox Task History (cluster-wide)
# Output: JSON

set -e

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

# Get cluster-wide tasks (includes all nodes)
# /cluster/tasks returns recent tasks from ALL cluster nodes
cluster_tasks = run_pvesh('pvesh get "/cluster/tasks" --output-format json')

seen_upids = set()

for t in cluster_tasks:
    upid = t.get("upid", "")
    if not upid or upid in seen_upids:
        continue
    seen_upids.add(upid)

    task = {
        "upid": upid,
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

    # Separate running from completed
    if task["status"] == "running" or not task["endtime"]:
        task["status"] = "running"
        result["running"].append(task)
    else:
        result["tasks"].append(task)

# Output valid JSON
print(json.dumps(result))
PYTHON_SCRIPT
