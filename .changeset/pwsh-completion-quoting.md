---
"nipa-cli": patch
---

Tab completion in PowerShell now inserts a name that has a space or another special character, such as `my server`, in single quotes, so `nipa server inspect` gets the whole name as one argument. A name made only of letters, digits and `_ . - : / = @ + ,` is inserted as before. Typing `web[` or `web*` now completes names that start with those characters, and you can type the opening quote yourself.
