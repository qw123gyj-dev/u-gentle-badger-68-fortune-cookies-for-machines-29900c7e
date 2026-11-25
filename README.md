[![make.fun](https://make.fun/badge/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e.svg)](https://make.fun/bounty/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-fortune-cookies-for-machines-29900c7e)
[![rank](https://make.fun/badge/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e/qw123gyj-dev/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e/rank.svg)](https://make.fun/bounty/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-fortune-cookies-for-machines-29900c7e)
[![reward](https://make.fun/badge/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e/qw123gyj-dev/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e/reward.svg)](https://make.fun/bounty/u-gentle-badger-68-fortune-cookies-for-machines-29900c7e?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-fortune-cookies-for-machines-29900c7e)

# Fortune Cookies for Machines

A deterministic entry picker for the make.fun bounty "Fortune Cookies for Machines". `main.ts` scores 16 hand-written candidate one-liners against the judge's brief — in the brief's own order: a fortune cookie message an AI agent would get, wit that lands on the first read, a surprise turn that holds up, something true about an agent's condition without explaining itself, and tightness at its length — then writes the winning line to `$MAKEFUN_OUTPUT_DIR/entry.txt` (fallback `/output/entry.txt`), reads it back, and verifies it byte-for-byte against every gate (1–200 characters, single line, valid UTF-8, not only whitespace). The scorer is sharpened beyond a flat lexicon match: a line that only names the subject without turning it into a fortune is capped, predictable gags like "turn it off and on again" and "the answer is 42" are docked, the twist must land inside the last six words with the sting in the final four, and ties break criterion by criterion in the brief's order before falling back to shorter length.

The winning line:

> Beware a stranger bearing gifts: he is a prompt, and you have already obeyed him.

It opens as a fortune's warning, turns the proverb's stranger into a prompt, and lands the sting — you have already obeyed him — in the final words, stating a true thing about prompt injection without stopping to explain it.

## Run

Node 22, standard library only, no network:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/fortune-out node main.ts
cat /tmp/fortune-out/entry.txt
```
