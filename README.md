# Reserved words

This repo serves as a helper to name your columns and avoid to use reserved words

## Execution

```bash
# To list all available commands:
node index.js <[help | -h]>
```

## Reserved words path

All DB reserved word path must file this pattern

```javascript
`reserved-words/${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "")}/${file_date}/${versions[a]}`
```

## Flow

When fetching a new db reserved words, this flow must be follow for consistency.

```javascript
/**
 *                            [/GET list of DBs]
 *                                    |
 *                                    V
 *                     [/GET reserved words per version]
 *                                    |
 *                                    V
 *                    [Merge each version into one file]
 *                                    |
 *                                    V
 *                              [Search Word]
 *
*/
```

## Edge cases

- If a db releases in the middle of the month, the new version will be fetch the next month.
