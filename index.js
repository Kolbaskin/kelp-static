const fs   = require('fs');
const url  = require('url');
const path = require('path');
const mime = require('mime2');
/**
 * [exports description]
 * @param  {[type]} root    [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
module.exports = function(root, options){
  var defaults = {
    index: 'index.html',
    sharedModelsPath: [
      /[\/\\]{1}model[\/\\]{1}[a-z0-9]{1,}\.js$/i
    ]
  };
  options = options || {};
  for(var k in options)
    defaults[ k ] = options[ k ];
  options = defaults;
  root = path.resolve(root);

  var checkFileName = function(fileName) {
    for(var i=0;i<defaults.sharedModelsPath.length;i++) {
      if(defaults.sharedModelsPath[i].test(fileName)) return true;
    }
    return false;
  }

  /**
   * [function description]
   * @param  {[type]}   req  [description]
   * @param  {[type]}   res  [description]
   * @param  {Function} next [description]
   * @return {[type]}        [description]
   */
  return function(req, res, next){
    var pathname = url.parse(req.url).pathname;
    var filename = path.join(root, pathname);
    if(filename.indexOf(root) !== 0) return next();
    if(filename.endsWith('/') && typeof options.index === 'string')
      filename += options.index;
    fs.stat(filename, function(err, stat){
      if(err) return next(err);
      if(stat.isDirectory()){
        if(options.index === true){
          return renderDirectory(root, filename, res);
        }
        res.writeHead(301, {
          'Location': pathname + '/'
        });
        return res.end();
      }
      const mtime = new Date(stat.mtimeMs).toUTCString();
      if(req.headers['if-modified-since'] === mtime){
        res.writeHead(304);
        return res.end();
      }
      var type = mime.lookup(filename);
      var charset = /^text\/|^application\/(javascript|json)/.test(type) ? 'UTF-8' : false;
      res.setHeader('Last-Modified', mtime);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));

      if(checkFileName(filename)) {    
        prepareModelFile(filename, (content) => {         
          res.send(content);
        })
      } else
        fs.createReadStream(filename).pipe(res);
    });
  };
};

function prepareModelFile(fileName, cb) {  
  fs.readFile(fileName, 'utf-8', function(e, s) {
      var c, j, l, i = 0, out = '', sharedName, comma, startSpaceLog;
      s = s.toString();      
      while(i<s.length) {
          if(s.substr(i, 15) == '// scope:server') {
              j = out.length-1;
              while(j>=0 && out.charAt(j) != '\n') j--;
              if(j>=0) out = out.substr(0,j+1)
              else out = '';
              i+=15
          } else 
          if(s.substr(i, 18) == '/* scope:server */') {
              i+=18;
              sharedName = '';
              comma = '';
              startSpaceLog = true;
              while(i<s.length && (c = s.charAt(i)) !='{') {
                if(c == ',' && startSpaceLog) {
                  comma = 'start';
                } else
                if(c == '$' && !sharedName) {
                  startSpaceLog = false;
                  while(true) {
                    sharedName += c;
                    i++;
                    if(!/[a-z0-9_]/i.test(c = s.charAt(i)))
                      break;
                  }
                }
                i++;
              }
              l = 1;
              i++;
              while(i<s.length) {
                  c = s.charAt(i)
                  if(c =='{') l++;
                  else
                  if(c =='}') {
                      l--;
                      if(!l) break;
                  }
                  else
                  if(c == '\n')
                      out += '\n'
                  i++;
              }
              i++;
              if(sharedName) {
                if(comma == 'start') out += ',';
                out += 'async ' + sharedName + '() {return await this.__runSharedFunction(arguments)}';
                if(comma != 'start') out += ',';
              }
          } else
              out += s.charAt(i++)
      }
      
      cb(out)
  })    
}
/**
 * [renderDirectory description]
 * @param  {[type]}   dir      [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
function renderDirectory(cwd, dir, res){
  var content = '';
  content += '<h1>Index of '+ dir.replace(cwd, '') +'</h1>';
  content += '<hr />';
  fs.readdir(dir, function(err, files){
    content += '<table width="50%">';
    content += '<tr>';
    content += '<td><a href="..">../</a></td>';
    content += '</tr>';
    files.map(function(filename){
      var stat = fs.statSync(path.join(dir, filename));
      filename = filename +  (stat.isDirectory() ? '/' : '');
      content += '<tr>';
      content += '<td><a href="' + filename + '">' + filename + '</a></td>';
      content += '<td>' + (stat.mtime || '-')      +                '</td>';
      content += '<td>' + (stat.size        )      +                '</td>';
      content += '</tr>';
    }).join('');
    content += '</table>';
    content += '<hr/>';
    content += 'Powered by <a href="https://github.com/song940/kelp-static" >kelp-static</a>';
    res.setHeader('Content-Type', 'text/html');
    res.end(content);
  });
}
