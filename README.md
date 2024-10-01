# Reserved words

This repo serves as a helper to name your columns and avoid to use reserved words

## Execution

- Development

```bash
# To list all available commands:
node index.js <[help | -h]>
```

- Global as command (Not supported yet.)

```bash
# `pu` stands for platform utility and helps prevent clashing with other
#  global commands.
pu-search-db-rw <[help | -h]>
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

## Create project to binary (Not supported yet.)

1 - Add in the beganning of the index.js file

```javascript
#!/usr/bin/env node
```

2 - Edit package.json

```json
{
  ...,
  "scripts": {
    ...,
    "build": "pkg .",
    ...
  },
  "bin": {
    "p-search-rw": "index.js"
  },
  "pkg": {
    "targets": [
      "node22-linux-x64",
      "node22-macos-x64",
      "node22-win-x64"
    ]
  },
  ...
}
```

3 - create executable

```bash
# This creates binary files
npm run build
```

## Use project binary (not support it yet.)

1 - symlink

```bash
sudo ln -s /path/to/your/mycommand-linux /usr/local/bin/mycommand
```

2 - mv the binary

```bash
# Mac or Linux
sudo mv mycommand-macos /usr/local/bin/mycommand
```

```powershell
# Windows
move mycommand-win.exe "C:\Program Files\mycommand.exe"
```

## Release target (not support it yet.)

```bash
gh release create v1.0.0 mycommand-linux mycommand-macos mycommand-win.exe --title "Version 1.0.0" --notes "Initial release of mycommand."
```

## Release the project (non-binary) (not support it yet.)

```bash
 gh release create 1.0.0 --title "Version 1.0.0" --notes "PostgreSQL support."
```


## Cavitats

- pkg support up to node 18 and is depricated.


## TODO

- find a replacement of pkg. Is `nexe` or `esbuild` a good replacement?
