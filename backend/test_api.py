import asyncio
import sys
import os

# Add backend to python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app, rooms, matches

def test_full_flow():
    client = TestClient(app)
    
    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200
    print(" 1. Health check passed:", res.json())

    # 2. Join Jiwon (Seeker)
    jiwon_res = client.post("/api/room/KOSS26/join", json={
        "nick": "지원",
        "school": "국민대",
        "status": "NEED_HELP",
        "note": "GitHub Actions 배포에서 권한 오류로 막힘"
    })
    assert jiwon_res.status_code == 200
    jiwon_id = jiwon_res.json()["id"]
    print(f" 2. Jiwon joined with ID {jiwon_id}")

    # 3. Join Minseo (Helper)
    minseo_res = client.post("/api/room/KOSS26/join", json={
        "nick": "민서",
        "school": "순천향대",
        "status": "CAN_HELP",
        "note": "작년에 도커 CI 파이프라인 구축해봄"
    })
    assert minseo_res.status_code == 200
    minseo_id = minseo_res.json()["id"]
    print(f" 3. Minseo joined with ID {minseo_id}")

    # 4. Check tags extracted
    jiwon_member = rooms["KOSS26"]["members"][jiwon_id]
    minseo_member = rooms["KOSS26"]["members"][minseo_id]
    print("    - Jiwon extracted tags:", jiwon_member["tags"])
    print("    - Minseo extracted tags:", minseo_member["tags"])
    assert len(jiwon_member["tags"]) > 0
    assert len(minseo_member["tags"]) > 0

    # 5. Check match
    pair_key = f"{jiwon_id}_{minseo_id}"
    print("    - Matches in memory:", list(matches.keys()))
    assert pair_key in matches or len(matches) > 0
    match_info = list(matches.values())[0]
    print(" 4. AI Complementary Match verified:")
    print("    - Why:", match_info["why"])
    print("    - Opener:", match_info["opener"])

    # 6. React to match
    match_id = match_info["id"]
    react_res = client.post(f"/api/match/{match_id}/react", json={
        "match_id": match_id,
        "reaction": "LIKE"
    })
    assert react_res.status_code == 200
    print(" 5. Match reaction saved successfully")

    # 7. Admin summary
    admin_res = client.get("/api/admin/summary")
    assert admin_res.status_code == 200
    print(" 6. Admin summary verified:", admin_res.json())

    print("\n ALL BACKEND TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_full_flow()
