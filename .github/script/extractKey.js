// const cheerio = require("cheerio");
// const fs = require("fs");
import fs from 'fs';
import axios from "axios";
import cheerio from "cheerio";

const url = "https://w1.moviesapi.club/v/Ww2inibUTJx5/"
const getData = async () => {
    const output = process.argv[2];
    if (!output) {
        return;
    }

    console.log({url, output});

    const htmlData = await axios.get(url, {headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36",
        "Referer": "https://moviesapi.club/"
    }});
    // const htmlData = await response.text();

    
    const parseData = cheerio.load(htmlData.data);
    let SCRIPT = "";

    parseData("script").each((key, item) => {
        const text = parseData(item).text();
        if (text.indexOf("eval") != -1) {
            console.log(text);
            SCRIPT = text;
        }
    })

    if (!SCRIPT) {
        return;
    }

    fs.writeFileSync(output, SCRIPT);
    return;

}
getData();