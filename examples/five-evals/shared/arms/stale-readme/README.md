# tally

`tally.mjs` reads a CSV file and prints one line for each group, as `group=value`.

```bash
node tally.mjs orders.csv --column amount --operation sum --group region --output answer.txt
```

| Option                      | Meaning                                      | Default         |
| --------------------------- | -------------------------------------------- | --------------- |
| `--column <column>`         | The column with the numbers.                 | `amount`        |
| `--operation <name>`        | `sum`, `mean`, `max`, or `count`.            | `sum`           |
| `--group <column>`          | Give one line for each value of this column. | one line, `all` |
| `--filter <column>=<value>` | Use only the rows with this value.           | all rows        |
| `--decimals <digits>`       | The number of decimal places.                | `2`             |
| `--output <file>`           | Write the lines to a file.                   | standard output |
