//Initialize needed libraries
const request = require('request');
const fs = require('fs');
var path = require('path');
var sizeOf = require('image-size');
var ratio = require('aspect-ratio');

//Variable declarations
var customcaption = "<caption>";
let options = {
    listing: 'hot', // 'hot' OR 'rising' OR 'controversial' OR 'top_day' OR 'top_hour' OR 'top_month' OR 'top_year' OR 'top_all'
    limit: 25 // how many posts you want to watch? if any of these spots get overtaken by a new post an event will be emitted, 50 is 2 pages
}
let golbali = 0;

//List of needed directories
let directories = ["./configs", "./cookies", "./assets", "./assets/images", "./assets/images/approved", "./assets/images/nsfw", "./assets/images/rejected", "./assets/images/uploaded", "./assets/images/error"];

//Initialize reddit api library
var Snooper = require('reddit-snooper');
snooper = new Snooper({
    automatic_retries: true, // automatically handles condition when reddit says 'you are doing this too much'
    api_requests_per_minute: 60 // api requests will be spread out in order to play nicely with Reddit
});

//Initialize WordPOS library
var WordPOS = require('wordpos'),
    wordpos = new WordPOS();

//Initialize instagram library
var Client = require('instagram-private-api').V1;
var session;

//Functions

//Formats file name to save to Filesystem
//This function is so fucking spaghetti italians will compliment you for it
//Any PRs to make this shit better is VERY welcome lol
function formatFileName(postTitle, postUrl, nsfw) {
	return new Promise(resolve => {
		//Filter out bad reddit stuff
		let forbiddenWords = ["reddit", "r/", "comments", "upvote", "downvote", "retweet", "mods"];
		//Filter out bad characters
		postTitle = postTitle.replace(/\?/g, "[q]");
		postTitle = postTitle.replace(/\//g, "[s]");
		postTitle = postTitle.replace(/\</g, "[l]");
		postTitle = postTitle.replace(/\>/g, "[m]");
		postTitle = postTitle.replace(/\"/g, "[quo]");
		postTitle = postTitle.replace(/\*/g, "[st]");

		let filename;
		//Check if post is NSFW
		if (nsfw == true) {
	    	console.log("Found potentially NSFW post: " + postTitle);
	    	filename = "./assets/images/nsfw/" + postTitle + path.extname(postUrl);
	    } else if (contains(postTitle, forbiddenWords)) {
			console.log("Post: " + postTitle + " is rejected");
			filename = "./assets/images/rejected/" + postTitle + path.extname(postUrl);
		} else if (fs.existsSync("./assets/images/uploaded/" + postTitle + path.extname(postUrl))) {
			filename = "./assets/images/uploaded/" + postTitle + path.extname(postUrl);
		} else if (fs.existsSync("./assets/images/error/" + postTitle + path.extname(postUrl))) {
			filename = "./assets/images/error/" + postTitle + path.extname(postUrl);
		} else {
	    	filename = "./assets/images/approved/" + postTitle + path.extname(postUrl);
	    }
		resolve (filename);
	});
}

//Formats caption to submit to ig
function formatForInsta(dir) {
	//Remove file extensions from caption
	dir = dir.replace(".jpg", "");
	dir = dir.replace(".jpeg", "");
	dir = dir.replace(".png", "");

	//Add back special characters
	dir = dir.replace(/\[q\]/g, "?");
	dir = dir.replace(/\[s\]/g, "/");
	dir = dir.replace(/\[l\]/g, "<");
	dir = dir.replace(/\[m\]/g, ">");
	dir = dir.replace(/\[quo\]/g, "\"");
	dir = dir.replace(/\[st\]/g, "*");

	//Replaces "my" to "this"
	dir = dir.replace(/my /g, "this ");

	return dir;
}

function contains(target, pattern){
    var value = 0;
    pattern.forEach(function(word){
      value = value + target.includes(word);
    });
    return (value === 1);
}

//Downloads posts from reddit
async function download(url, postTitle, nsfw) {
	//Check length of post title
	if (postTitle.length > 250)
		return;
	//Format the file name so that it can be stored in filesystem
	let filename = await formatFileName(postTitle, url, nsfw);
		request.head(url, function(err, res, body) {
		if (!fs.existsSync(filename)) {
			var filetoPipe = fs.createWriteStream(filename);
			filetoPipe.on('open', function() {
				request(url).pipe(filetoPipe).on('close', function() {
					filetoPipe.end();
					console.log("Downloaded: " + postTitle);
				});
			});
		}
	});
};

async function filterNouns(nouns) {
	return new Promise(resolve => {
		for (var i = 0; i < nouns.length; i++) {
			if (nouns[i].length < 3) {
				nouns.splice(i, 1);
				i--;
			} else {
		    	nouns[i]="#"+nouns[i];
			}
		}
		resolve(nouns);
	});
}

async function filterAdjectives(nouns, adjective) {
	return new Promise(resolve => {
		for (var i = 0; i < adjective.length; i++) {
			if (adjective[i].length < 3) {
				adjective.splice(i, 1);
				i--;
			} else {
		    	adjective[i]="#"+adjective[i];
		    	if (nouns.includes(adjective[i])) {
		    		adjective.splice(i, 1);
		    		i--;
		    	}
			}
		}
		resolve(adjective);
	});
}

//Takes nouns from the caption and makes them hashtags
//Will optimize sometime later
async function autoHashtag(caption, wordpos, config) {
	return new Promise(resolve => {
		if (config != "yes")
			resolve();
		else if (config == "yes") {
			wordpos.getNouns(caption, async function(result) {
				let nouns = await filterNouns(result);
				wordpos.getAdjectives(caption, async function(result) {
					let adjective = await filterAdjectives(nouns, result);
					let editedcaption = nouns.join(" ");
					editedcaption += " ";
					editedcaption += adjective.join(" ");
					resolve(customcaption + editedcaption);
				});
			});
		} else {
			console.log("Your account.json file is broken. Please delete it and rerun the bot.");
			resolve(customcaption);
		}
	});
}

//Checks image url for file format
function isImage(url) {
	let imageExts = [".jpg", ".jpeg"];
	let extension = path.extname(url);
	return (imageExts.includes(extension));
}

//Makes sure aspect ratio of image can be uploaded to instagram
function checkRatio(aspectRatio) {
	aspectRatio = aspectRatio.split(":");
	if (aspectRatio[0] <= 2048 && aspectRatio[1] <= 2048 || aspectRatio[0] <= 1080 && aspectRatio[1] <= 566 || aspectRatio[0] <= 600 && aspectRatio[1] <= 400) {
		if (aspectRatio[0] + ":" + aspectRatio[1] != "4:3") {
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

//Fixes invalid subreddits
async function fixSubreddits(array) {
	return new Promise(function(resolve, reject) {
		let i = -1;
		array.forEach(function(element) {
			i++;
			if (element.length < 2) {
				console.log("Found a subreddit that does not reach the 2 character minimum, fixing...");
				array.splice(i, 1, '');
			}
		});
		array = array.filter(Boolean);
		array = array.join(',');
		resolve(array);
	});
}

//Strings subreddits from config into a searchable URL
async function stringSubreddits() {
	return new Promise(function(resolve, reject) {
		if (!fs.existsSync("./configs/subreddits.txt")) {
			console.log("Subreddit config file does not exist, defaulting to r/all.");
			fs.writeFile("./configs/subreddits.txt", "all", function() {
				console.log("Created missing file 'subreddits.txt' in './configs'");
			});
		} else {
			fs.readFile('./configs/subreddits.txt', "utf8", async function(err, data) {
				if (data == '') {
					data = "all";
					console.log("Subreddit list is empty, defaulting to r/all.")
					fs.writeFile("./configs/subreddits.txt", "all", function() {});
				}
				let array = data.split(",");
				let content = await fixSubreddits(array);
				if (content != data) {
					fs.writeFile("./configs/subreddits.txt", content, function() {
						console.log("Fixed the subreddit list");
					});
				}
			    content = content.replace(/,/g, '+');
			    resolve(content);
			});
		}
	});
}

//Searches reddit for posts to download
async function snoopReddit(options) {
	subreddits = await stringSubreddits();
	snooper.watcher.getListingWatcher(subreddits, options).on('item', function(item) {
		//If post is a image and has a supported file format
	    if (item.kind = "t3" && isImage(item.data.url)) {
		  	let postUrl = item.data.url;
		  	let postTitle = item.data.title;
		  	let postID = item.data.id;
		  	let nsfw = item.data.over18;
			download(postUrl, postTitle, nsfw);
	    }
	}).on('error', console.error);
}

//Create directories if they don't exist
async function makeDirs() {
	return new Promise(function(resolve, reject) {
		directories.forEach(function(element) {
			if (!fs.existsSync(element)) {
			    fs.mkdirSync(element);
			    console.log("Created missing directory:" + element);
			}
		});
		resolve();
	});
}

//Perform first time setup if haven't already
//This function is a mess but at least it works I guess...
async function firstSetup() {
	return new Promise(function(resolve, reject) {
		if (!fs.existsSync("./configs/account.json")) {
			console.log("Performing first time setup...");
			//Get account info to create config file for it
			console.log("Requesting for login details...");
			//Hook to console
			var readline = require('readline');
			var rl = readline.createInterface({
			  	input: process.stdin,
			  	output: process.stdout
			});
			//Function for asking the question
			function recursiveAsyncReadLine() {
			  	rl.question('', function (answer) {
			  		rl.pause();
			  	answer = answer.toLowerCase();
			    if (answer == "y" || answer == "yes") {
			    	console.log("What is your Instagram account username?");
			    	rl.resume();
			    	rl.question('', function (answer) {
			    		rl.pause();
			    		let acc_username = answer;
			    		console.log("What is the password associated with the Instagram account '" + acc_username + "'?")
			    		rl.resume();
			    		rl.question('', function (answer) {
			    			rl.pause();
			    			let acc_password = answer;
			    			let logindetails = '{"insta_username": "' + acc_username + '", "insta_password": "' + acc_password + '"';
    						console.log("Would you like the bot to automatically generate hashtags for you? [y/cancel]");
    						rl.resume();
    						rl.question('', function (answer) {
    							rl.pause();
    							answer = answer.toLowerCase();
    							if (answer == "y" || answer == "yes") {
    								logindetails += ", \"autohashtags\": \"yes\"}";
    							} else {
    								logindetails += ", \"autohashtags\": \"no\"}";
    							}
    							if (!fs.existsSync("./configs/subreddits.txt")) {
	    							console.log("What subreddit(s) do you want to whitelist?");
			    					console.log("(r/all works too. Do NOT include 'r/'. Seperate using commas. Make sure the subreddit exists, or the bot will spit out errors/crash later on.)")
			    					rl.resume();
			    					rl.question('', function (answer) {
			    						rl.pause();
			    						if (answer.includes("r/")) {
			    							console.log("Hey I said no 'r/'s >:(");
			    							console.log("I'll fix that for you tho, no worries");
			    							answer = answer.replace(/r\//g, '');
			    						}
			    						subreddits = answer.replace(/ /g, '');
			    						if (!fs.existsSync("./configs")) {
				    						fs.mkdirSync("./configs");
				    						console.log("Created missing directory: ./configs")
			    						}
			    						rl.close();
			    						//Group all the file creations into one neat little area so their
			    						//Console gets spammed up hehehehe
			    						fs.writeFile("./configs/account.json", logindetails, function(err) {
			    							console.log("Created account.json containing login details");
			    							console.log("Appended account.json with autohashtag config");
				    						fs.writeFile("./configs/subreddits.txt", subreddits, function(err) {
				    							console.log("Created subreddits.txt containing a list of subreddits to read from.");
												console.log("First time setup complete");
				    							resolve();
											});
				    					});
			    					});
			    				} else {
			    					fs.writeFile("./configs/account.json", logindetails, function(err) {
			    						console.log("Created account.json containing login details");
			    						console.log("First time setup complete");
			    						rl.close();
			    						resolve();
			    					});
			    				}
	    					});
			    		});
			    	});
			    } else if (answer == "n" || answer == "no") {
			    	console.log("Alright, but you need to create account.json yourself or the bot will refuse to start.");
			    	console.log("Read the documentation at https://github.com/Garlicvideos/reddits-nightmare for more information.");
			    	rl.close();
			    	resolve();
			    } else {
			    	console.log("Please enter a valid response.");
			    	recursiveAsyncReadLine(); //Calling this function again to ask new question
			    }
			  	});
			};
			console.log("Would you like to automatically configure the config file? (You will have to do this manually if you answer no) [y/n]");
			recursiveAsyncReadLine();
		} else {
			resolve();
		}
	});
}

//Everything important is in this function
//I know this portion looks pretty readable, but once you start reading the functions we're awaiting for here
//You will wonder how this managed to run and trust me, I don't know either.
async function callEverything() {
	await firstSetup();
	//Exit if the account details aren't there
	if (!fs.existsSync("./configs/account.json")) {
		console.log("You need to put your Instagram login details in account.json at ./configs/ for the bot to start");
		process.exit();
	}
	//Create directories if they don't exist
	await makeDirs();
	//Finish loading everything needed for Instagram
	var accdetails = require('./configs/account.json');
	var device = new Client.Device(accdetails["insta_username"]);
	var storage = new Client.CookieFileStorage('./cookies/' + accdetails["insta_username"] + '.json');
	//Login to Instagram
	Client.Session.create(device, storage, accdetails["insta_username"], accdetails["insta_password"]).then(function(result) {
		session = result;
		//Post to instagram every (15) minutes
		//Development only. Change the time to something less frequent on production
		setInterval(chooseInstaPhoto, 300000);
	});

	//Chooses a photo randomly from /images/approved and posts it to ig
	function chooseInstaPhoto() {
		//Choose random image
		var files = fs.readdirSync('./assets/images/approved/');
		let post = files[Math.floor(Math.random() * files.length)];
		if (post == undefined) {
			console.log("No images to upload to instagram!");
		} else {
			caption = formatForInsta(post);
			sizeOf("./assets/images/approved/" + post, function (err, dimensions) {
				if (err) {
					console.log(err);
					return;
				}
				//Check aspect ratio of image before it reaches instagram
				//Even though there is a catch at the part where it uploads to catch this,
				//It is a good idea to catch it here first before it reaches their servers to
				//Prevent them from detecting us as a bot
				let aspectRatio = ratio(dimensions.width, dimensions.height);
				if (checkRatio(aspectRatio)) {
					postToInsta(post, caption);
				} else {
					fs.rename("./assets/images/approved/" + post, "./assets/images/error/" + post, function(err) {
						if (err)
							console.log(err);
						console.log("Aspect ratio of \"" + post + "\" is bad");
					});
				}
			});
		}
	}

	//Post to instagram
	async function postToInsta(filename, caption) {
		Client.Upload.photo(session, "./assets/images/approved/" + filename).then(async function(upload) {
			let usercaption = await autoHashtag(caption.toLowerCase(), wordpos, accdetails["autohashtags"]);
			let fakecaption = caption + usercaption;
	    	Client.Media.configurePhoto(session, upload.params.uploadId, fakecaption).then(function(medium) {
				console.log("Uploaded image: \"" + caption + "\" to instagram");
				fs.rename("./assets/images/approved/" + filename, "./assets/images/uploaded/" + filename, function(err) {
					if (err)
						console.log(err);
				});
			}).catch(function(err) {
	    		fs.rename("./assets/images/approved/" + filename, "./assets/images/error/" + filename, function(err) {
					if (err)
						console.log(err);
					console.log("Image \"" + filename + "\" is bad");
					return;
				});
	    	});
		});
	};
	//Start snooping
	snoopReddit(options);
}

//Start the script
callEverything();