var http = require('http');
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');
var cronJob = require('cron').CronJob;
var qs = require('querystring');

PORT = 31225;

MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.txt': 'text/plain'
};

var connection = mysql.createConnection({
	host     : 'dbsrv1.cdf.toronto.edu',
	user     : 'g2halazi',
	password : 'chahraec',
	database : 'csc309h_g2halazi',
});

connection.connect(function(err) {
	if (err) console.log('db connection error');
	console.log('connected to db');
});

// var sql = 'INSERT INTO blogs (hostname, validation) VALUES ("thenextweb.tumblr.com", "true") ON DUPLICATE KEY UPDATE bid = bid';
// connection.query(sql, function(err, results) {
	// if (err) {
		// console.log('Inserting error blog:');
	// }
	// else {
		// console.log('Inserted blog');
	// }
// });

function serveFile(filePath, response) {
  fs.exists(filePath, function(exists) {
    if (!exists) {
      response.writeHead(404);
      response.end();
      return;
    }

    fs.readFile(filePath, function(error, content) {
      if (error) {
        response.writeHead(500);
        response.end();
        return;
      }

      var extension = path.extname(filePath);
      var mimeType = MIME_TYPES[extension];
      response.writeHead(200,
                         {'Content-Type': mimeType ? mimeType : 'text/html'});
      response.end(content, 'uft-8');
    });
  });
}

// check 0-9 digit
function regIsDigit(fData)
{
    var reg = new RegExp("^[0-9]*$");
    return (reg.test(fData));
}

function sendResult(result, length, response) {
	if (result.trending.length == length) {
		//response.writeHead(200, {'Content-Type': 'application/json'});
		response.writeHead(200, { 'content-type':'application/json',
                          'Access-Control-Allow-Origin' : '*'});
		response.write(JSON.stringify(result));
		response.end();
	}
}

function queryAndSend(query, order, limit, response) {
	connection.query(query, function(err, rows, fields) {
		if (err) {
			console.log('posts query error');
			response.writeHead(404);
			response.end();	
		}
		else {
			var postObject = { "trending" :[], "order": order, "limit": limit };
			for (var i in rows) {			
				(function (post, length, response, callback) {
					var pid = post.pid;
					var sql = '';
					var object_row;
					sql = 'SELECT timestamp, sequence, increment, count FROM tracks WHERE pid = ?'
					connection.query(sql, [pid], function(err, rows, fields) {
						if (err) {
							console.log('tracks query error');
							response.writeHead(404);
							response.end();	
						}
						else {
							object_row = { "url" : post.url, "text" : post.text, 
							  "image" : post.image, "date" : post.date,
							  "last_track" : post.last_track, 
							  "last_count" : post.last_count, "tracking":rows };
							postObject.trending.push(object_row);
							callback(postObject, length, response);
						}
					});	
				})(rows[i], rows.length, response, sendResult);
			}
			if (rows.length < 1) {
				response.writeHead(404);
				response.end();	
			}
		} 
    });
}

/**
 * This function performs the GET method and writes the response into the 
 * page as a string of content type json. It assumes that connection is
 * already enstablished and uses connection to send queries and retrieve
 * information from the database.
 * 
 * The parameters hostname and limit are optional. hostname is the base
 * hostname of the blog when doing a GET /blog/{base-hostname}/trends.
 * When doing a GET /blog/trends or /blog/recent, hostname is not necessary.
 * Limit controls the maximum number of results. By default, limit is set
 * to 10.
 */
function getPosts(hostname, limit, order, response) {
  
  if ((order != 'Trending') && (order != 'Recent')) {
    console.log("The order parameter must be the string 'Trending' or 'Recent'");
    response.writeHead(404);
	response.end();	
  }
  if (!regIsDigit(limit)) {
	console.log('Usage: limit argument does not support negative numbers');
	response.writeHead(404);
	response.end();	
  }

  var query = '';
  if (order == 'Recent') {	    
    if (hostname != '') {
		query = 'SELECT DISTINCT p.pid, url, text, image, date, last_track, last_count ' +
	      'FROM blogs b, posts p ' + 
	      'WHERE b.bid = p.bid AND validation = "true" AND hostname = ' + connection.escape(hostname) + ' ' +
	      'ORDER BY date DESC LIMIT ' + limit;
		queryAndSend(query, order, limit, response);
    }
    else {
		query = 'SELECT * FROM posts ORDER BY date DESC LIMIT ' + limit;
		queryAndSend(query, order, limit, response);
    }
  } 
  else {
    if (hostname != '') {
		query = 'SELECT count(pid) as count FROM posts';
		connection.query(query, function(err, rows, fields) {
			if (err) {
				console.log('posts query error');
				response.writeHead(404);
				response.end();	
			}
			else {
				var count = rows[0].count;
				var sql = 'select * from blogs b, posts p, (select * from tracks order by timestamp DESC limit '+ count + ') t ' + 
						'where p.pid = t.pid AND p.bid = b.bid AND validation= "true" AND hostname = ' + connection.escape(hostname) + ' ' +
						'ORDER BY increment DESC LIMIT ' + limit;
				queryAndSend(sql, order, limit, response);
			}
		});
    } 
	else {
		query = 'SELECT count(pid) as count FROM posts';
		connection.query(query, function(err, rows, fields) {
			if (err) {
				console.log('posts query error');
				response.writeHead(404);
				response.end();	
			}
			else {
				var count = rows[0].count;
				var sql = 'select * from posts p, (select * from tracks order by timestamp DESC limit '+ count + ') t ' + 
						'where p.pid = t.pid ORDER BY increment DESC LIMIT ' + limit;
				queryAndSend(sql, order, limit, response);
			}
		});
    }
  }
}
// Replaces commonly-used Windows 1252 encoded chars that do not exist in ASCII or ISO-8859-1 with ISO-8859-1 cognates.
var replaceWordChars = function(text) {
    var s = text;
    s = s.replace(/[\u2018|\u2019|\u201A]/g, "\'");
    s = s.replace(/[\u201C|\u201D|\u201E]/g, "\"");
    s = s.replace(/\u2026/g, "...");
    s = s.replace(/[\u2013|\u2014]/g, "-");
    s = s.replace(/\u02C6/g, "^");
    s = s.replace(/\u2039/g, "<");
    s = s.replace(/\u203A/g, ">");
    s = s.replace(/[\u02DC|\u00A0]/g, " ");
    return s;
}

var job = new cronJob({
	cronTime: '30 30 * * * *',
	onTick: function() {
		// Runs every hour.
		console.log('tracking begin');
		connection.query('SELECT * FROM blogs', function(err, brows, bfields) {
			if (err) {
				console.log('blogs query error');
				response.writeHead(404);
				response.end();	
			}
			else {
				for (var c=0;c<brows.length;c++) {
					(function (bid, hostname, validation) {
						if (validation != 'false') {
							http.get('http://api.tumblr.com/v2/blog/' + hostname + '/likes?api_key=eP0ufr5bNu10rEa0Olm66CygjVYextz1L6jkVKbHdsgysTcHxT&limit=30', function(res) {
								if (res.statusCode == '200') {
									var buffer = '';
									//res.setEncoding('utf8');
									res.on('data', function(chunk){
										buffer += chunk;
									});
									res.on('end', function() {
										var posts = JSON.parse(buffer).response.liked_posts;
										for (var i=0;i<posts.length;i++) {									
											(function (post) {
												var sql = '';
												var new_increment;
												var pid = post.id;
												var pcount = post.note_count;
												var purl = post.post_url;
												var pdate = post.date;
												connection.query('SELECT * FROM posts WHERE pid = ?', [pid], function(err, prows, pfields) {
													if (err) {
														console.log('posts query error');
														response.writeHead(404);
														response.end();
													}
													else {
													if (prows.length == 1) new_increment = pcount - prows[0].last_count;
													else new_increment = 0;	
													sql = 'INSERT INTO tracks (pid, increment, count) VALUES (?, ?, ?)';
													connection.query(sql, [pid, new_increment, pcount], function(err, results) {
														if (err) {
															console.log('posts query error');
															response.writeHead(404);
															response.end();
														}
													});
													var text = '';
													var image = '';
													if ((post.type == 'text') && (typeof post.body != 'undefined')) {
														text = post.body;
													}
													else if ((post.type == 'quote') && (typeof post.text != 'undefined')) {
														text = post.text;
													}
													else if ((post.type == 'link') && (typeof post.title != 'undefined')) {
														text = post.title;
													}
													else if ((post.type == 'answer') && (typeof post.answer != 'undefined')) {
														text = post.answer;
													}
													else if ((post.type == 'video') && (typeof post.caption != 'undefined')) {
														text = post.caption;
														if (typeof post.thumbnail_url != 'undefined') {
															image = post.thumbnail_url;
														}
													}
													else if ((post.type == 'audio') && (typeof post.caption != 'undefined')) {
														text = post.caption;
													}
													else if ((post.type == 'photo') && (typeof post.caption != 'undefined')) {
														text = post.caption;
														image = post.photos[0].alt_sizes[0].url;						
													}
													else if ((post.type == 'chat') && (typeof post.body != 'undefined')) {
														text = post.body;
													}	
													text = replaceWordChars(text);
													sql = 'INSERT INTO posts (pid, bid, url, text, image, date, last_count) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE last_count = ?, last_track = CURRENT_TIMESTAMP';
													connection.query(sql, [pid, bid, purl, text, image, pdate, pcount, pcount], function(err, results) {
														if (err) {
														console.log('posts query error');
														response.writeHead(404);
														response.end();
													}
													});
												}													
												});										
											})(posts[i]);
										}
									});
								}
								else {
									connection.query('UPDATE blogs SET validation="false" WHERE bid=?', [bid], function(err, results) {
										if (err) {
											console.log('posts query error');
											response.writeHead(404);
											response.end();
										}
										console.log('changed bid:' + bid + ' to false');
									});
								}
							}).on('error', function(e) {
								console.log("Got error: " + e.message);
							});
						}
					})(brows[c].bid, brows[c].hostname, brows[c].validation);
				}
			}
		});
	},
	start: false
});
job.start();

http.createServer(function(request, response) {
	if (request.url == '/blog') {
		if (request.method == 'POST') {
			var buffer = '';		
			request.on('data', function(chunk) {
				buffer += chunk;
			});
			request.on('end', function() {
				console.log(qs.parse(buffer).blog);
				var hostname = qs.parse(buffer).blog;
				var sql = 'INSERT INTO blogs (hostname, validation) VALUES (?, "true") ON DUPLICATE KEY UPDATE bid = bid';
				connection.query(sql, [hostname], function(err, results) {
					if (err) {
						console.log('Inserting error blog:' + hostname);
						response.writeHead(404);
						response.end();
					}
					else {
						console.log('Inserted blog:' + hostname);
						response.writeHead(200);
						response.end();
					}
				});
			});
		}
		else {
			response.writeHead(404);
			response.end();			
		}
	}
	else if (request.url.indexOf('/blogs/trends') == 0) {
		if (request.method == 'GET') {
			var uri = require('url').parse(request.url, true);
			var limit;
			var order = uri.query.order;
			if (typeof uri.query.limit != 'undefined') limit = uri.query.limit;
			else limit = '10';
			getPosts('', limit, order, response);
		}
		else {
			response.writeHead(404);
			response.end();				
		}
	}
	//
	else if (request.url.indexOf('/blog/') == 0) {
		if (request.method == 'GET') {
			var uri = require('url').parse(request.url, true);
			var tmp = request.url.split("/")[2];
			var limit;
			var hostname;
			var order = uri.query.order;
			if (typeof uri.query.limit != 'undefined') limit = uri.query.limit;
			else limit = '10';
			if (typeof tmp == 'string')  {
				hostname = tmp;
				getPosts(hostname, limit, order, response);
			}
			else {
				response.writeHead(404);
				response.end();	
			}
		}
		else {
			response.writeHead(404);
			response.end();				
		}
	}
	
}).listen(PORT);

console.log('Server running at http://127.0.0.1:' + PORT + '/');



