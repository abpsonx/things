import os
import glob

app_dir = "src/app"
files = glob.glob(app_dir + "/**/*.tsx", recursive=True)

for file in files:
    with open(file, "r") as f:
        content = f.read()
    
    if "<AppLayout>" in content:
        # We need to remove the import
        content = content.replace('import AppLayout from "@/components/layout/AppLayout";', '')
        content = content.replace('import AppLayout from "../../../../components/layout/AppLayout";', '')
        content = content.replace('import AppLayout from "../../../components/layout/AppLayout";', '')
        # Remove tags but keep children
        content = content.replace("<AppLayout>", "<>")
        content = content.replace("</AppLayout>", "</>")
        
        with open(file, "w") as f:
            f.write(content)
        print(f"Updated {file}")

