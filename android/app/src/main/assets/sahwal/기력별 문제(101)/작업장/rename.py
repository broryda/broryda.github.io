import os

# ✅ 번호를 붙일 폴더 (현재 폴더라면 ".")
target_dir = "."

# ✅ 확장자 필터
ext = ".sgf"

# 폴더 안의 sgf 파일 목록 정렬
files = [f for f in os.listdir(target_dir) if f.lower().endswith(ext)]
files.sort()

# 6자리 번호로 순서대로 이름 변경
for i, old_name in enumerate(files, start=1):
    new_name = f"{i:06d}{ext}"
    old_path = os.path.join(target_dir, old_name)
    new_path = os.path.join(target_dir, new_name)
    os.rename(old_path, new_path)
    print(f"{old_name} → {new_name}")

print(f"\n총 {len(files)}개 파일 이름 변경 완료!")
