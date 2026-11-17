# tally

`tally.mjs` reads a CSV file and prints one line for each group, as `group=value`.

```bash
node tally.mjs orders.csv --of amount --op sum --by region --out answer.txt
```

| Option                     | Meaning                                      | Default         |
| -------------------------- | -------------------------------------------- | --------------- |
| `--of <column>`            | The column with the numbers.                 | `amount`        |
| `--op <name>`              | `sum`, `mean`, `max`, or `count`.            | `sum`           |
| `--by <column>`            | Give one line for each value of this column. | one line, `all` |
| `--where <column>=<value>` | Use only the rows with this value.           | all rows        |
| `--round <digits>`         | The number of decimal places.                | `2`             |
| `--out <file>`             | Write the lines to a file.                   | standard output |
