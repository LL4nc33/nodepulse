#!/bin/bash
# Task Discovery Script fuer NodePulse
# Sammelt: Proxmox Task History
# Output: JSON

set -e

echo "{"

# =====================================================
# Tasks (completed + running)
# =====================================================
echo '"tasks": ['

hostname=$(hostname)
first=true

if command -v pvesh &> /dev/null; then
  # Get recent tasks (last 200)
  tasks_json=$(pvesh get "/nodes/$hostname/tasks" --limit 200 --output-format json 2>/dev/null || echo "[]")

  echo "$tasks_json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    first = True
    for t in data:
        upid = t.get('upid', '')
        node = t.get('node', '')
        task_type = t.get('type', '')
        vmid = t.get('id', '')  # Can be empty string
        user = t.get('user', '')
        status = t.get('status', '')
        exitstatus = t.get('exitstatus', '')
        starttime = t.get('starttime', 0)
        endtime = t.get('endtime', 0)
        pid = t.get('pid', 0)
        pstart = t.get('pstart', 0)

        # Convert vmid to int or null
        vmid_val = 'null'
        if vmid and vmid != '':
            try:
                vmid_val = str(int(vmid))
            except:
                vmid_val = 'null'

        # Escape strings
        user = user.replace('\"', '\\\\\"')
        exitstatus = exitstatus.replace('\"', '\\\\\"') if exitstatus else ''

        if not first:
            print(',')
        first = False

        print('{\"upid\":\"%s\",\"node\":\"%s\",\"type\":\"%s\",\"id\":%s,\"user\":\"%s\",\"status\":\"%s\",\"exitstatus\":\"%s\",\"starttime\":%s,\"endtime\":%s,\"pid\":%s,\"pstart\":%s}' %
              (upid, node, task_type, vmid_val, user, status, exitstatus, starttime or 0, endtime or 0, pid or 0, pstart or 0))
except Exception as e:
    import sys
    print('', file=sys.stderr)
" 2>/dev/null
fi

echo '],'

# =====================================================
# Running Tasks (from cluster - includes all nodes)
# =====================================================
echo '"running": ['

if command -v pvesh &> /dev/null; then
  running_json=$(pvesh get "/cluster/tasks" --output-format json 2>/dev/null || echo "[]")

  echo "$running_json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    first = True
    # Filter only running tasks
    running = [t for t in data if t.get('status') == 'running' or not t.get('endtime')]
    for t in running:
        upid = t.get('upid', '')
        node = t.get('node', '')
        task_type = t.get('type', '')
        vmid = t.get('id', '')
        user = t.get('user', '')
        status = 'running'
        starttime = t.get('starttime', 0)
        pid = t.get('pid', 0)
        pstart = t.get('pstart', 0)

        vmid_val = 'null'
        if vmid and vmid != '':
            try:
                vmid_val = str(int(vmid))
            except:
                vmid_val = 'null'

        user = user.replace('\"', '\\\\\"')

        if not first:
            print(',')
        first = False

        print('{\"upid\":\"%s\",\"node\":\"%s\",\"type\":\"%s\",\"id\":%s,\"user\":\"%s\",\"status\":\"%s\",\"starttime\":%s,\"pid\":%s,\"pstart\":%s}' %
              (upid, node, task_type, vmid_val, user, status, starttime or 0, pid or 0, pstart or 0))
except:
    pass
" 2>/dev/null
fi

echo ']'

echo "}"
