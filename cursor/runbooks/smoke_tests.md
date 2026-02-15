# Smoke Tests (DAW)

Run on VPS or from a host that can reach the URLs:

```bash
curl -fsSI https://beerbook.drinksafterwork.net | head
curl -fsSI https://auth.drinksafterwork.net | head
curl -fsSI https://drinksafterwork.net | head
```

(Adjust hostnames if your front door URL differs.) Full checks in `runbooks/smoke_tests.md`.
