# ⚠️ 이 저장소는 이전되었습니다

# 🚚 x-kit → xm

**`x-mesh/x-kit` 마켓플레이스가 `x-mesh/xm`으로 이름이 변경되었습니다.**

> **새 주소: https://github.com/x-mesh/xm**

---

## 빠른 마이그레이션

```bash
# 기존 마켓플레이스 제거
claude plugin marketplace remove x-kit

# 새 마켓플레이스 설치
claude plugin marketplace add x-mesh/xm
```

슬래시 커맨드도 변경:
- 이전: `/x-kit:x-op`, `/x-kit:x-solver`, `/x-kit:x-build`
- 이후: **`/xm:op`**, **`/xm:solver`**, **`/xm:build`**

자세한 내용은 [MIGRATION.md](./MIGRATION.md) 참고.

---

## 상태

- **Frozen.** 더 이상 업데이트되지 않습니다.
- 조만간 GitHub에서 archive 처리됩니다.
- 이슈·PR·릴리즈: **https://github.com/x-mesh/xm**
