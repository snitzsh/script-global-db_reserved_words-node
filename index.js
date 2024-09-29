const { Command } = require('commander');
const {
  mkdir: fsMkdir,
  writeFile: fsWriteFile,
  readFile: fsReadFile,
  access: fsAccess,
  readdir: fsReaddir,
  unlink: fsUnlink
} = require('fs/promises');
const { join: pathJoin } = require('path');

const axios = require('axios');
const cheerio = require('cheerio');

function getUTCTime() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  return {
    "date": `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
    "file_date": `${year}_${month}` // Script usually executes once per month.
  }
}

function sanitizeDBName (db_name = "") {
  return db_name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "");
}

function canBeConvertedToInteger (str) {
  const num = parseFloat(str);
  return !isNaN(num) && num.toString() === str.trim();
}

function createPath (item_name) {
  return pathJoin(__dirname, item_name);
}

// TODO:
//  - Figure out if sleep must be added here, there are itme
async function deleteFile (dir_path, cb) {
  try {
    await fsUnlink(dir_path);
    console.info(`File '${dir_path}' deleted.`);
    return (cb) ? cb(null, true) : true;
  } catch (error) {
    console.error(`File '${dir_path}' was not deleted.`);
    return (cb) ? cb(error, null) : error;
  }
}

async function listDirFiles (dir_path, cb) {
  try {
    let file_list = await fsReaddir(dir_path);
    return cb(null, file_list);
  } catch (error) {
    // console.log("File does not exist");
    return cb(error, null);
  }
}

async function fileExists(file_path, cb) {
  try {
    await fsAccess(file_path);
    return cb(null, true);
  } catch (error) {
    console.error(`File '${file_path}' does not exist.`);
    return cb(error, null);
  }
}

function getDirPaths () {
  let dirs = {
    "dbs": "",
    "reserved-words": ""
  };
  for (let a in dirs) {
    dirs[a] = createPath(a);
  }
  return dirs;
}

async function ajaxGet (url, cb) {
  await axios.get(url)
    .then((response) => {
      return cb(null, response);
    })
    .catch((error) => {
      console.log(error);
      return cb(error, null);
    })
}

async function readJsonFromFile(file_path, cb) {
  try {
    // Read the file asynchronously
    const data = await fsReadFile(file_path, 'utf8');
    // Parse the JSON data
    const json_data = JSON.parse(data);
    return cb(null, json_data)
  } catch (error) {
    // console.error('Error reading the JSON file:', error.Error);
    return cb(error, null)
  }
}

async function writeJsonToFile(file_path = "", json_data = {}, inline = false, cb) {
  try {
    // Convert JSON data to a string
    const jsonString = JSON.stringify(json_data, null, ((inline) ? 0 : 2));
    // Write the JSON string to the file asynchronously
    await fsWriteFile(file_path, jsonString, 'utf8');
    console.log(`File saved at ${file_path}`);
    return (cb) ? cb(null, true) : true;
  } catch (error) {
    console.error('Error writing to JSON file:', error);
    return (cb) ? cb(error, null) : error;
  }
}

function mergeWordFunc (utc_time = {}, dirs = {}, platform_dbs = {}, platform_db_index = null) {
  let { file_date } = utc_time;
  let {
    name,
    "versions": platform_db_versions
  } = platform_dbs[platform_db_index];
  console.log(dirs);
  // console.log(platform_dbs);
  var obj = {
    "PostgreSQL": async () => {
      let vpd = platform_db_versions.reverse();
      let total_file_path = createPath(`reserved-words/${name}/total.json`);
      let dir_path = createPath(`reserved-words/${sanitizeDBName(name)}/${file_date}`);
      let total_obj = await readJsonFromFile(total_file_path, (error, data) => {
        if (error) {
          // return empty array, because the file will be created later.
          return {};
        }
        return data.reserved_words;
      });
      let files_to_delete = [];
      for (let a = 0, len_a = vpd.length; a < len_a; a++) {
        let version = vpd[a];
        let version_file_path = `${dir_path}/${version}.json`;
        await readJsonFromFile(version_file_path, (error, data) => {
          if (error) {
            console.info(`File '${version_file_path}' has been processed or does not exits.`);
            return;
          };
          let column_name = data.column_names;
          data.reserved_words.map((word) => {
            let key = Object.keys(word)[0];
            let key_info = word[key];

            if (version.column_names === undefined) {
              console.log("FAILED: ", version, key_info);
            }
            let index = total_obj.hasOwnProperty(key);
            if (!index) {
              total_obj[key] = {
                "created_at": [version],
                "key_created_at": file_date, // Help know when was the key processed and added.
                "rows": [
                  {
                    [version]: key_info
                  }
                ],
                "column_names": [
                  {
                    [version]: column_name
                  }
                ]
              };
            } else {
              total_obj[key].created_at.push(version);
              total_obj[key].rows.push({
                [version]: key_info
              });
              total_obj[key].column_names.push({
                [version]: column_name
              });
            }
          });
          files_to_delete.push(version);
        });
      }
      if (files_to_delete.length > 0) {
        console.info(`${files_to_delete.length} new versions to add in total.json file`);
        writeJsonToFile(total_file_path, {
          "updated_at": file_date,
          "versions": platform_db_versions,
          "reserved_words": total_obj
        }, true, (error, _) => {
          if (error) return;
          let version_file_path;
          for (let b = 0, len_b = files_to_delete.length; b < len_b; b++) {
            version_file_path = `${dir_path}/${files_to_delete[b]}.json`;
            deleteFile(version_file_path);
          }
        });
      } else {
        console.info("No new versions to add in total.json file");
      }
    }
  }
  if (!obj.hasOwnProperty(name)) {
    return false;
  }
  return obj[name];
}

function reservedWordsFunc (utc_time = {}, platform_dbs = {}, platform_db_index = null) {
  let { file_date } = utc_time;
  let { name, url } = platform_dbs[platform_db_index];
  console.info(`Retrieving ${name} reserved words.`);
  var obj = {
    "PostgreSQL": () => {
      // Always fetch the `current` version to fetch all other versions.
      ajaxGet(url, async (error, response) => {
        if (error) return;
        const $ = cheerio.load(response.data);
        let version_rows = $(".docs-version-selected")
          .parent()
          .parent()
          .parent();
        let versions = $(version_rows)
          .find("div a").map((_, el) => {
            let text = $(el).text();
            if (canBeConvertedToInteger(text)) {
              // TODO:
              //  - Maybe return int so we can order by desc or anc order?
              return text
            }
          }).get();
        let versions_to_get = [];

        if (platform_dbs[platform_db_index].versions.length === 0) {
          versions_to_get = versions;
          // Does NOT keeps the versions and new versions in order.
          platform_dbs[platform_db_index].versions = versions;
        } else {
          // push the one that is missing.
          versions.map((item) => {
            if (platform_dbs[platform_db_index].versions.indexOf(item) === -1) {
              versions_to_get.unshift(item);
              platform_dbs[platform_db_index].versions.unshift(item);
              // NOTE:
              //   - if a version fails, the next try, it will put the version
              //    (not in order). Ex. [10, 9]. If 9 fails, the next try it
              //    will put the 9 like this: [9, 10]. That's why it must be reorder.
              //
              platform_dbs[platform_db_index].versions.sort((a, b) => parseFloat(b) - parseFloat(a));
            }
          });
        }

        if (versions_to_get.length < 1) {
          console.info("No versions to process");
          return;
        }
        let dir_path = createPath(`reserved-words/${sanitizeDBName(name)}/${file_date}`);
        let failed_versions = [];
        // creates folder
        await createFolders({"reserved-words": dir_path});
        for (let c = 0, len_a = versions_to_get.length; c < len_a; c++) {
          let version = versions_to_get[c];
          let file_path = `${dir_path}/${version}.json`;
          fileExists(file_path, (_, data) => {
            if (data) return;
            // if doesn't exist, it will get the version.
            let version_url = url.replace("current", version);
            ajaxGet(version_url, async (error_2, response_2) => {
              if (error_2) return;
              const $c_2 = cheerio.load(response_2.data);
              let table_col = $c_2(`#pgContentWrap ${(parseInt(version, 10) < 10) ? ".TABLE" : "#KEYWORDS-TABLE"} table thead tr th`)
                .map((_, el_2) => {
                  return $c_2(el_2).text();
                })
                .get()
                .slice(1); // removes the first column name: "Key Word"
              let rows = $c_2(`#pgContentWrap ${(parseInt(version, 10) < 10) ? ".TABLE" : "#KEYWORDS-TABLE"} table tbody tr`)
                .map((_, el_3) => {
                  return [
                    $c_2(el_3)
                      .find('td')
                      .map((_, cell) => {
                        return $(cell)
                          .text()
                          .trim();
                      })
                      .get()
                  ];
                })
                .get()
                .map((item_2, _) => {
                  return {
                    // removes the first column name: <[key_name]>, because it will be the key of the object.
                    [item_2[0]]: item_2.slice(1)
                  };
                });
              let obj = {
                "column_names": table_col,
                "reserved_words": rows
              };
              writeJsonToFile(file_path, obj, false, (error, _) => {
                if (error) {
                  failed_versions.push(version);
                }
              });
            });
          });
        }
        // NOTE:
        //  - This ensures, versions that failed are not added into .versions, so it
        //    can get reparsed.
        if (platform_dbs[platform_db_index].versions.length > 0 && versions_to_get.length > 0) {
          let index;
          for (let d = 0, len_c = failed_versions.length; d < len_c; d++) {
            index = platform_dbs[platform_db_index].versions.indexOf(failed_versions[d]);
            if (index !== -1) {
              platform_dbs[platform_db_index].versions.splice(index, 1);
            }
          }
          // Updates platform-dbs to add versions or new versions.
          writeJsonToFile(createPath("platform-dbs.json"), platform_dbs, false);
        }
      });
    }
  }
  if (!obj.hasOwnProperty(name)) {
    return false;
  }
  return obj[name];
}

function cmdSearchWord (utc_time = {}, dirs = {}, options = {dbName: "", word: ""}) {
  let {dbName: db_name, word} = options;
  let total_file_path = createPath(`reserved-words/${db_name}/total.json`);
  readJsonFromFile(total_file_path, (error, data) => {
    if (error) return;
    let found_word = data.reserved_words[word.toUpperCase()]; // TODO: should all dbs have the keyword uppercased?
    if (!found_word) {
      console.error(`Word ${word} not found`);
    }
    console.info(found_word);
  });
}

async function cmdGetReserveWords (sub_cmd="", utc_time = {}, dirs = {}) {
  const { file_date } = utc_time;
  const { "dbs": folder_path } = dirs;
  let file_path = createPath("platform-dbs.json");
  readJsonFromFile(file_path, async (error, data) => {
    if (error) return;
    let platform_dbs = data;
    // IMPORTANT:
    //  - This will get dbs per-date, if a source url where we get the db names
    //    changes from PostgreSQL to Postgres, all the docs will be afferected
    //    and or corrupted for PostgreSQL.
    // TODO:
    //  - Figure out if per-date list is necessary or do we need just one list?
    const file_path_2 = `${folder_path}/${file_date}.json`; // Change 'icon.png' to your desired filename
    readJsonFromFile(file_path_2, (error_2, data_2) => {
    if (error_2) return error_2;
      var db = {};
      for (let a = 0, len_a = data_2.count; a < len_a; a++) {
        db = data_2.dbs[a];
        let platform_db_index = platform_dbs.findIndex(_db => _db.name === db.name);
        let platform_db = platform_dbs[platform_db_index];
        let platform_db_found = (platform_db !== undefined);
        if (!platform_db_found) {
          continue;
        }
        switch (sub_cmd) {
          case 'reserved-words':
            // code block
            reservedWordsFunc(utc_time, platform_dbs, platform_db_index)();
            break;
          case 'merge-reserved-words':
            mergeWordFunc(utc_time, dirs, platform_dbs, platform_db_index)();
            break
          default:
            console.warn(`No sub command '${sub_cmd}'`);
            break
        }
      }
    });
  });
}

// NOTE:
//  - This script will be executed monthly or weekly basis.
async function cmdGetDbs (utc_time = {}, dirs = {}) {
  let { file_date, date: created_at } = utc_time;
  const url = 'https://www.dbvis.com/supported-databases/';
  ajaxGet(url, (error, response) => {
    if (error) return;
    // Load the HTML into cheerio
    const file_path = `${dirs.dbs}/${file_date}.json`; // Change 'icon.png' to your desired filename
    const $ = cheerio.load(response.data);
    let obj = {
      'count': 0,
      'dbs': []
    };
    const db_elements = $('div.dbListOverview.dbListOverview__dbItem');
    obj.count = db_elements.length
    db_elements.each((_, element) => {
      let db_name = $(element)
        .find('span.dbListOverview.dbListOverview__dbTitle span')
        .first()
        .text();
      let db_icon = $(element)
        .find('span.dbListOverview.dbListOverview__dbIcon img')
        .attr('data-src');
      let db_about = $(element)
        .find('section.dbListOverview.dbListOverview__dbDataPointWrapper.dbListOverview__dbDataPointWrapper--about p')
        .text();
      //
      // TODO:
      //  - maybe match the previous month vs current month, and throw error
      //    if a prop doesn't have similar against the new prop value?
      //
      let db = {
        "name": db_name,
        "icon": db_icon,
        "about": db_about
      };
      for (let b in db) {
        if (typeof db[b] !== "string" || db[b].length < 1) {
          throw new Error(`${db_name} has invalid '${b}' data type.`);
        }
      };
      // TODO:
      //  - make sure to never override this prop back to empty string everytime this parents function (cmd) is executed.
      db["type"] = "";
      db["created_at"] = created_at;
      obj.dbs.push(db);
    });
    // TODO:
    //  - download db icons
    writeJsonToFile(file_path, obj, false);
  });
}

async function createFolders (dirs) {
  for (let a in dirs) {
    try {
      let dir_path = dirs[a];
      // Create the directory asynchronously, ensuring parent directories are
      // created if needed
      await fsMkdir(dir_path, { "recursive": true });
    } catch (error) {
      console.error('Error creating directory:', error);
    }
  }
}

// TODO:
//  - Support db .type (rational, document db, etc.)
//  - if dbs/<[date: previous month]> and dbs/<[date: current month]> hasn't
//    changed, removed the previous month.
async function main () {
  const program = new Command();
  let utc_time = getUTCTime();
  let dirs = getDirPaths();

  await createFolders(dirs);

  program
    .command("fetch-dbs")
    .description("/GET http request to fetch the dbs. It will save the file in\ndbs/<[date: YYYY_MM]>.json")
    .action(() => {
      cmdGetDbs(utc_time, dirs);
    });

  program
    .command("fetch-reserved-words")
    .description(`/GET http request to fetch the reserved words per version.\nSaves each version in \nreserved-words/<[db_name]>/<[date: YYYY_MM]>/<[1, ... 10]>.json\n`)
    .action(() => {
      cmdGetReserveWords('reserved-words', utc_time, dirs);
    });

  program
    .command("merge-reserved-words")
    .description("Reads each version generated by cmd 'fetch-reserved-words',\nthen saves in reserved-words/<[db_name]>/total.json\n")
    .action(() => {
      cmdGetReserveWords('merge-reserved-words', utc_time, dirs);
    });

  program
    .command("search")
    .description("Searches words generated by cmd 'merge-reserved-words'.")
    .requiredOption('--db-name <value>', 'DB name listed in platform.dbs.json')
    .requiredOption('--word <value>', 'Reserved word you wish to search')
    .action((options) => {
      // db-name = dbName
      cmdSearchWord('merge-reserved-words', utc_time, dirs, options);
    });

  program.parse(process.argv);
}

main();
