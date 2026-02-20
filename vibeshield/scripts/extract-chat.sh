#!/bin/bash
# ============================================================================
# VibeShield: Extract Chat History from IDE Storage
# ============================================================================
# Reads Antigravity's global state DB (trajectory summaries + agent state)
# and brain artifacts to build a comprehensive chat history JSON file.
#
# Output: ~/.vibeshield/chat_history.json
# ============================================================================

OUTPUT_DIR="$HOME/.vibeshield"
OUTPUT_FILE="$OUTPUT_DIR/chat_history.json"
GLOBAL_DB="$HOME/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
BRAIN_DIR="$HOME/.gemini/antigravity/brain"

mkdir -p "$OUTPUT_DIR"

echo "🔍 VibeShield Chat History Extractor"
echo "   Reading IDE storage..."

python3 << 'PYEOF'
import json
import os
import subprocess
import base64
import re
import glob
from datetime import datetime
from pathlib import Path

output_dir = os.path.expanduser("~/.vibeshield")
output_file = os.path.join(output_dir, "chat_history.json")
global_db = os.path.expanduser("~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb")
brain_dir = os.path.expanduser("~/.gemini/antigravity/brain")

os.makedirs(output_dir, exist_ok=True)

chat_history = {
    "extracted_at": datetime.now().isoformat(),
    "source": "VibeShield Chat Extractor v1.0",
    "sessions": [],
    "messages": [],
    "brain_artifacts": [],
    "debug": []
}

# ── Strategy 1: Extract from Global DB (Trajectory Summaries) ──

def run_sqlite(db, query):
    try:
        result = subprocess.run(
            ["/usr/bin/sqlite3", db, query],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip()
    except Exception as e:
        return ""

def extract_from_trajectory_data(db, key_name):
    """Extract readable chat messages from base64-encoded protobuf data."""
    raw = run_sqlite(db, f"SELECT value FROM ItemTable WHERE key = '{key_name}';")
    if not raw or len(raw) < 50:
        return []
    
    messages = []
    
    # Try to decode as base64
    try:
        decoded = base64.b64decode(raw)
        text = decoded.decode('utf-8', errors='replace')
    except:
        text = raw
    
    # Extract JSON blobs (contains TaskName, TaskSummary, Message)
    json_pattern = r'\{[^{}]*"(?:Message|TaskName|TaskSummary|BlockedOnUser)"[^{}]*\}'
    json_matches = re.findall(json_pattern, text)
    
    for jm in json_matches:
        try:
            parsed = json.loads(jm)
            
            if parsed.get("Message") and len(parsed["Message"]) > 10:
                messages.append({
                    "role": "assistant",
                    "text": parsed["Message"][:2000],
                    "source": key_name,
                    "task_name": parsed.get("TaskName", ""),
                    "task_status": parsed.get("TaskStatus", ""),
                    "timestamp": datetime.now().isoformat()
                })
            
            if parsed.get("TaskSummary") and len(parsed["TaskSummary"]) > 10:
                messages.append({
                    "role": "system",
                    "text": f"[Task: {parsed.get('TaskName', 'Unknown')}] {parsed['TaskSummary'][:1000]}",
                    "source": key_name,
                    "timestamp": datetime.now().isoformat()
                })
        except json.JSONDecodeError:
            pass
    
    # Extract readable strings (conversation fragments)
    readable_pattern = r'[A-Za-z][\w .,!?:;\'\"()*`#\n-]{30,}'
    readable_matches = re.findall(readable_pattern, text)
    
    seen = set()
    for r in readable_matches:
        clean = r.strip()[:500]
        # Skip base64-looking strings and duplicates
        if re.match(r'^[A-Za-z0-9+/]{50,}', clean):
            continue
        if '==' in clean and len(clean) > 100:
            continue
        if clean[:50] in seen:
            continue
        seen.add(clean[:50])
        
        # Determine role based on content heuristics
        role = "context"
        if any(kw in clean.lower() for kw in ["fix", "error", "crash", "bug", "implement"]):
            role = "developer_context"
        
        messages.append({
            "role": role,
            "text": clean,
            "source": key_name,
            "timestamp": datetime.now().isoformat()
        })
    
    return messages

if os.path.exists(global_db):
    chat_history["debug"].append(f"Found global DB: {global_db}")
    
    # Key 1: Trajectory summaries
    msgs1 = extract_from_trajectory_data(global_db, "antigravityUnifiedStateSync.trajectorySummaries")
    chat_history["messages"].extend(msgs1)
    chat_history["debug"].append(f"trajectorySummaries: {len(msgs1)} items")
    
    # Key 2: Agent state
    msgs2 = extract_from_trajectory_data(global_db, "jetskiStateSync.agentManagerInitState")
    chat_history["messages"].extend(msgs2)
    chat_history["debug"].append(f"agentManagerInitState: {len(msgs2)} items")
    
    # Key 3: Unified trajectory
    msgs3 = extract_from_trajectory_data(global_db, "unifiedStateSync.trajectorySummaries")
    chat_history["messages"].extend(msgs3)
    chat_history["debug"].append(f"unifiedTrajectorySummaries: {len(msgs3)} items")
else:
    chat_history["debug"].append("Global DB not found")

# ── Strategy 2: Brain Artifacts (task.md, implementation_plan.md) ──

if os.path.exists(brain_dir):
    # Get the 10 most recent conversation directories
    conv_dirs = sorted(
        [d for d in Path(brain_dir).iterdir() 
         if d.is_dir() and d.name != 'tempmediaStorage' and not d.name.startswith('.')],
        key=lambda d: d.stat().st_mtime,
        reverse=True
    )[:10]
    
    for conv_dir in conv_dirs:
        artifact_files = ['task.md', 'implementation_plan.md', 'walkthrough.md']
        for af in artifact_files:
            af_path = conv_dir / af
            if af_path.exists():
                try:
                    content = af_path.read_text()
                    if len(content) > 20:
                        chat_history["brain_artifacts"].append({
                            "conversation_id": conv_dir.name,
                            "artifact_type": af.replace('.md', ''),
                            "content": content[:3000],
                            "modified": datetime.fromtimestamp(af_path.stat().st_mtime).isoformat()
                        })
                except Exception:
                    pass
        
        # Also read metadata files
        for mf in conv_dir.glob("*.metadata.json"):
            try:
                meta = json.loads(mf.read_text())
                if meta.get("summary") and len(meta["summary"]) > 10:
                    chat_history["brain_artifacts"].append({
                        "conversation_id": conv_dir.name,
                        "artifact_type": f"metadata:{mf.stem}",
                        "content": meta["summary"][:1000],
                        "modified": datetime.fromtimestamp(mf.stat().st_mtime).isoformat()
                    })
            except Exception:
                pass
    
    chat_history["debug"].append(f"Brain artifacts: {len(chat_history['brain_artifacts'])} items from {len(conv_dirs)} conversations")

# ── Strategy 3: Workspace DB (current project state) ──

# Find the VibeShield workspace storage
ws_base = os.path.expanduser("~/Library/Application Support/Antigravity/User/workspaceStorage")
if os.path.exists(ws_base):
    for ws_dir in os.listdir(ws_base):
        ws_json = os.path.join(ws_base, ws_dir, "workspace.json")
        if os.path.exists(ws_json):
            try:
                with open(ws_json) as f:
                    ws_data = json.load(f)
                if "VibeShield" in ws_data.get("folder", ""):
                    ws_db = os.path.join(ws_base, ws_dir, "state.vscdb")
                    if os.path.exists(ws_db):
                        # Extract chat-related keys
                        keys_raw = run_sqlite(ws_db, "SELECT key FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%history%';")
                        for key in keys_raw.split("\n"):
                            key = key.strip()
                            if key:
                                val = run_sqlite(ws_db, f"SELECT value FROM ItemTable WHERE key = '{key}';")
                                if val and len(val) > 20:
                                    chat_history["sessions"].append({
                                        "key": key,
                                        "value": val[:2000],
                                        "workspace": "VibeShield"
                                    })
                        chat_history["debug"].append(f"Workspace DB: {len(chat_history['sessions'])} session entries")
            except Exception:
                pass

# ── De-duplicate messages ──
seen_texts = set()
unique_messages = []
for msg in chat_history["messages"]:
    snippet = msg["text"][:80]
    if snippet not in seen_texts:
        seen_texts.add(snippet)
        unique_messages.append(msg)

chat_history["messages"] = unique_messages
chat_history["total_messages"] = len(unique_messages)
chat_history["total_artifacts"] = len(chat_history["brain_artifacts"])

# ── Write output ──
with open(output_file, 'w') as f:
    json.dump(chat_history, f, indent=2, ensure_ascii=False)

print(f"✅ Chat history extracted successfully!")
print(f"   📄 Output: {output_file}")
print(f"   💬 Messages: {len(unique_messages)}")
print(f"   🧠 Brain Artifacts: {len(chat_history['brain_artifacts'])}")
print(f"   📊 Sessions: {len(chat_history['sessions'])}")
print(f"")
for d in chat_history["debug"]:
    print(f"   📋 {d}")

PYEOF
