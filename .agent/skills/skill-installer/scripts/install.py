import os
import shutil
import requests
import argparse

# Default installation paths for Antigravity
GLOBAL_SKILLS_PATH = r"C:\Users\mm\.gemini\antigravity\skills"
LOCAL_SKILLS_PATH = r".agent\skills"

def install_skill(skill_name, files_map, target_type="global"):
    """
    Installs a skill by writing a map of {relative_path: content} to the destination.
    target_type: "global" or "local"
    """
    base_path = GLOBAL_SKILLS_PATH if target_type == "global" else LOCAL_SKILLS_PATH
    destination = os.path.join(base_path, skill_name)

    print(f"Installing skill '{skill_name}' into {destination}...")

    if not os.path.exists(destination):
        os.makedirs(destination, exist_ok=True)

    for rel_path, content in files_map.items():
        file_dest = os.path.join(destination, rel_path)
        os.makedirs(os.path.dirname(file_dest), exist_ok=True)
        
        with open(file_dest, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  - Created: {rel_path}")

    print(f"\nSuccess! Skill '{skill_name}' is now installed.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Skill Installer Helper")
    parser.add_States = ["global", "local"]
    # Internal usage: The Agent will call this with pre-fetched data.
    # Note: Fetching logic is primarily handled by the Agent's tools (browser/read_url).
    print("Skill Installer script loaded.")
