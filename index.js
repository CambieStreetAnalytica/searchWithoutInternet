const express = require("express");
const request = require("request-promise");
// google translate setup
const Translate = require("@google-cloud/translate");
const projectId = "searchwithoutinternet";
const translate = new Translate.Translate({
  projectId: projectId
});

const app = express();
const bodyParser = require("body-parser");
const port = process.env.PORT || 1337;
const WEB = "web";
const YELP = "yelp";
const WIKI = "wiki";
const TR = "tr";
const URL = "url";
const HELP = "cmd";
const validTypes = [WEB, YELP, WIKI, TR, HELP, URL];
const supportedLanguages = ["en", "fr", "ru", "de", "es", "zh-CN"];

const yelp_key = "YELP_API_KEY";
const wiki_key = "WIKI_API_KEY";
const goog_key = "GOOGLE_SEARCH_API_KEY";
const api_key = "GOOGLE_API_KEY";
const DIFF_TOKEN = "ARTICLE_PARSER_API_KEY";

const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_TRANSLATE_LANGUAGE = "en";

let output = "";

app.use(bodyParser.urlencoded({ extended: false }));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`);
  //search("chinese", 3, yelp_key, parseResponseYelp).then(console.log);
  //searchURL("www.diffbot.com/dev/docs/article/").then(console.log);
  // console.log(parseMessage("yelp: chinese"));
  // console.log(parseMessage("yelp 10: chinese"));
  // console.log(parseMessage("hello world"));
  // searchTranslation("Hello world", "de").then(console.log);
});
app.get("/", (req, res) => {
  res.send("Application Base");
});

const MessagingResponse = require("twilio").twiml.MessagingResponse;

// search("india", 10, yelp_key, parseResponseYelp).then(function(val) {
//   console.log(val);
// });

search("chinese", 5, yelp_key, parseResponseYelp).then(function(val) {
  console.log(val);
});

app.post("/sms", (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMessage = req.body.Body.toLowerCase();
  const searchQuery = parseMessage(incomingMessage);
  if (searchQuery === null) {
    twiml.message("Invalid Search Query, please enter 'cmd' for help");
    sendMessage(res, twiml, 200);
  } else {
    let opt = searchQuery.hasOwnProperty("amount")
      ? searchQuery.amount
      : searchQuery.lang;
    makeQuery(searchQuery.type, opt, searchQuery.query).then(function(value) {
      twiml.message(value);
      sendMessage(res, twiml, 200);
    });
  }
});

function makeQuery(type, opt, query) {
  if (type === WEB) {
    output = "";
    return search(query, opt, goog_key, parseResponseGoog);
  } else if (type === WIKI) {
    output = "";
    return search(query, opt, wiki_key, parseResponseWiki);
  } else if (type === YELP) {
    output = "";
    return search(query, opt, yelp_key, parseResponseYelp);
  } else if (type === TR) {
    return searchTranslation(query, opt);
  } else if (type === URL) {
    return searchURL(query);
  } else if (type === HELP) {
    return searchHelp(query);
  }
}

function sendMessage(res, twiml, status) {
  res.writeHead(status, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}

function search(query, amount, key, parsing) {
  let url =
    "https://www.googleapis.com/customsearch/v1?key=" +
    api_key +
    "&cx=" +
    key +
    "&q=" +
    query;

  if (amount > 10) {
    output =
      "Search entry request exceeded limit, only maximum number of entries displayed \n\n";
    url += "&num=10";
    amount = 10;
  } else {
    url += "&num=" + amount;
  }

  const options = {
    url: url,
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Charset": "utf-8"
    }
  };

  console.log(url);
  return request(options).then(function(body) {
    let json = JSON.parse(body);
    response = parsing(json, amount);
    return response;
  });
}

function searchTranslation(text, lang) {
  return translate.translate(text, lang).then(function(translated) {
    return parseResponseTranslate(translated, lang);
  });
}

//parses the sent text message into {type, amount, query} -- returns null if msg is malformed
function parseMessage(msg) {
  // msg will look like 'wiki 10: germany' or 'wiki: germany' or 'yelp 5: chinese food' or 'yelp: chinese'
  // or 'tr fr: hello world' or 'tr ru: hello world'
  const prefixes = msg
    .split(":")[0]
    .split(" ", 2)
    .map(val => val.trim());
  const type = prefixes[0];
  const query =
    msg.split(":").length > 1 ? msg.split(":")[1].trim() : undefined;

  if (type === TR) {
    const lang = prefixes.length > 1 ? prefixes[1] : DEFAULT_TRANSLATE_LANGUAGE;
    const isValid = supportedLanguages.includes(lang) && query !== undefined;
    return isValid ? { type: type, lang: lang, query: query } : null;
  } else if (type === URL) {
    const isValid = query.includes(".");
    return isValid ? { type: type, query: query } : null;
  } else if (type === HELP) {
    return { type: type, query: query };
  } else {
    const amount =
      prefixes.length > 1 ? Number(prefixes[1]) : DEFAULT_SEARCH_LIMIT;
    const isValid =
      validTypes.includes(type) && !Number.isNaN(amount) && query !== undefined;
    return isValid ? { type: type, amount: amount, query: query } : null;
  }
}

function parseResponseGoog(json, amount) {
  let char_count = 0;
  //console.log(json.items.length);
  if (json.items.length < amount) {
    output += "Fewer search items produced than requested";
    amount = json.items.length;
  }

  for (i = 0; i < amount && char_count <= 1000; i++) {
    k = 1 + i;
    output += "result:" + k + "\n";
    output += JSON.stringify(json.items[i].title) + "\n";
    output += JSON.stringify(json.items[i].snippet) + "\n";
    try {
      if (json.items[i].pagemap.metatags[0]["og:url"] == undefined) {
        let link = json.items[i].link;
        link = stripHTTPS(link);
        output += "URL: " + JSON.stringify(link) + "\n";
      } else {
        let link = json.items[i].pagemap.metatags[0]["og:url"];
        link = stripHTTPS(link);
        output += "URL: " + JSON.stringify(link) + "\n";
      }
    } catch (err) {
      let link = json.items[i].link;
      link = stripHTTPS(link);
      output += "URL: " + JSON.stringify(link) + "\n";
    }
    output += "\n";
    char_count = output.length;
  }

  if (char_count >= 1000) {
    output += "Results truncated, SMS char count exceeded";
  }

  return output;
}

function stripHTTPS(str) {
  if (str.includes("https://")) {
    str = str.replace("https://", "");
  } else {
    str = str.replace("http://", "");
  }
  return str;
}

function parseResponseWiki(json, amount) {
  if (json.items.length < amount) {
    output += "Fewer search items produced than requested";
    amount = json.items.length;
  }

  let char_count = 0;
  for (i = 0; i < amount && char_count <= 1000; i++) {
    k = 1 + i;
    output += "result:" + k + "\n";
    output += JSON.stringify(json.items[i].title) + "\n";
    output += JSON.stringify(json.items[i].snippet) + "\n";
    output += "\n";
    char_count = output.length;
  }

  if (char_count >= 1000) {
    output += "Results truncated, SMS char count exceeded";
  }

  return output;
}

function parseResponseYelp(json, amount) {
  if (json.items.length < amount) {
    output += "Fewer search items produced than requested";
    amount = json.items.length;
  }
  let char_count = 0;
  for (i = 0; i < amount && char_count <= 1000; i++) {
    if (json.items[i].pagemap.aggregaterating == undefined) {
      output +=
        "Query is not a restaurant. Please enter restaurant name for reviews and address. \n";
      break;
    }
    k = 1 + i;
    output += "result:" + k + "\n";
    output += JSON.stringify(json.items[i].title) + "\n";

    output +=
      "Overall rating: " +
      JSON.stringify(json.items[i].pagemap.aggregaterating[0].ratingvalue) +
      "\n";
    output +=
      "Number of reviews: " +
      JSON.stringify(json.items[i].pagemap.aggregaterating[0].reviewcount) +
      "\n";
    output +=
      "Location: " +
      JSON.stringify(json.items[i].pagemap.postaladdress[0].streetaddress) +
      "\n";
    output += "\n";
    char_count = output.length;
    //console.log(char_count);
  }

  if (char_count >= 1000) {
    output += "Results truncated, SMS char count exceeded";
  }

  return output;
}

function parseResponseTranslate(arr, lang) {
  return `Translated text to ${lang}: ${arr[0]}`;
}

function searchURL(url) {
  let call = `https://api.diffbot.com/v3/article?token=${DIFF_TOKEN}&url=https://${url}`;

  const options = {
    url: call,
    method: "GET",
    headers: {
      Accept: "text/html",
      "Accept-Charset": "utf-8"
    }
  };

  return request(options).then(function(res) {
    return parseURL(JSON.parse(res));
  });
}

function parseURL(res) {
  if (
    res === undefined ||
    res === null ||
    res.objects === undefined ||
    res.objects === null
  ) {
    return "Invalid URL";
  } else {
    let article = res.objects[0].text;
    article = article
      .split("")
      .slice(0, 1400)
      .join("")
      .trim();
    if (article === "") {
      return "This Page Cannot Be Properly Displayed";
    } else {
      return article;
    }
  }
}

function searchHelp(query) {
  const genericHelp = `These are the possible commands available \n
        Web - Search Google\n
        Yelp - Search Yelp\n
        Wiki - Search Wikipedia\n
        Url - get Website text\n
        Tr - get translation\n
        commands are not case sensitive \n
        for more information, please type 'help: COMMAND'`;

  const webHelp =
    "\nWEB AMOUNT(optional): QUERY \n- gets top AMOUNT results of QUERY from Google, AMOUNT has a maximum of 10 and a default of 5";

  const yelpHelp =
    "\nYelp AMOUNT(optional): QUERY \n- gets top AMOUNT results of QUERY from Yelp, AMOUNT has a maximum of 10 and a default of 5";

  const wikiHelp =
    "\nWiki AMOUNT(optional): QUERY \n- gets top AMOUNT results of QUERY from Wikipedia, AMOUNT has a maximum of 10 and a default of 5";

  const urlHelp =
    "\nUrl: URL \n- Returns important text from URL (article body, etc), do not include https:// or https:// in URL";

  const trHelp =
    "\nTr LANG: TEXT_TO_TRANSLATE - Translates TEXT_TO_TRANSLATE in to LANG \n- supported LANG values: en, es, fr, de, ru, zh-CN";

  const notFound = "This command is not recognized";

  return new Promise(function(res, req) {
    if (query === undefined || query === null) {
      res(genericHelp);
    } else {
      if (query === "web") {
        res(webHelp);
      } else if (query === "yelp") {
        res(yelpHelp);
      } else if (query === "wiki") {
        res(wikiHelp);
      } else if (query === "url") {
        res(urlHelp);
      } else if (query === "tr") {
        res(trHelp);
      } else {
        res(notFound);
      }
    }
  });
}
