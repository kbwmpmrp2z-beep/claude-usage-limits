# usage-limits

Mod pro Claude Code: nad polem pro zprávu ukazuje barevný pruh s 5hodinovým a týdenním limitem předplatného a časem do resetu. Když limit dosáhne 90 %, zobrazí upozornění. V desktopové aplikaci má pruh navíc tlačítko **📡 Remote**, které zapíná a vypíná Remote Control aktuální session.

```
5h ████░░░░░░░░░░░░ 23% ↻ 2h 15m    týden ███████░░░░░░░░░ 41% ↻ 2d 3h
```

## Instalace

V Claude Code (terminál, desktopová aplikace nebo VS Code):

```
/plugin install usage-limits --marketplace kbwmpmrp2z-beep/claude-usage-limits
```

Potvrďte `y` a zvolte user scope. Repozitář je soukromý, takže počítač musí mít přístup ke GitHubu (např. `gh auth login`).

## Poznámky

- Vyžaduje aktuální Claude Code (`claude update`).
- Limity existují jen u předplatného Pro/Max; s API klíčem se pruh nezobrazí.
- Tlačítko Remote Control je jen v desktopové aplikaci (používá její přepínač z toolbaru); v terminálu se nezobrazí.
- Vypnutí: `claude plugin disable usage-limits`
