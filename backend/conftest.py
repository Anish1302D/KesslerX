import os
import sys

# Ensure backend directory is on sys.path when pytest is invoked from repository root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ["TESTING"] = "1"
os.environ["SPACE_TRACK_USERNAME"] = ""
os.environ["SPACE_TRACK_PASSWORD"] = ""
