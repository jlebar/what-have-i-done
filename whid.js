var templates = {};

Bag.prototype = {
  add: function(e) {
    var val = this.dict[e];
    if (val === undefined) {
      val = 0;
    }
    this.dict[e]  = val + 1;
  },

  toArray: function(comparator) {
    var arr = [];
    for (e in this.dict) {
      arr.push({elem: e, count: this.dict[e]});
    }

    if (comparator) {
      arr.sort(function(a, b) {
        return comparator(a.elem, b.elem);
      });
    }
    else {
      arr.sort(function(a, b) {
        if (a.count < b.count) {
          return -1;
        }
        if (a.count > b.count) {
          return 1;
        }
        if (a.elem < b.elem) {
          return -1;
        }
        if (a.elem > b.elem) {
          return 1;
        }
        return 0;
      });
    }

    return arr;
  }
};

function Bag() {
  this.dict = {};
}

$(document).ready(function() {
  Handlebars.registerHelper('showBug', function(id) {
    return 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id;
  });

  Handlebars.registerPartial('bugTooltip', 'Bug {{id}} - {{summary}}');

  templates.bugs = Handlebars.compile($('#bugsTemplate').html());

  initUsernameField();
  getBugs('justin.lebar+bug@gmail.com');
});

function initUsernameField() {
  var defaultText = 'Bugzilla e-mail';
  $('#username').focus(function() {
    $(this).removeClass('defaultText');
    if ($(this).attr('value') == defaultText) {
      $(this).attr('value', '');
    }
  });

  $('#username').blur(function() {
    if ($(this).attr('value') == '') {
      $(this).addClass('defaultText');
      $(this).attr('value', defaultText);
    }
  });

  var lastUsername = localStorage.getItem('lastUsername');
  if (!lastUsername) {
    $('#username').addClass('defaultText');
    $('#username').attr('value', defaultText);
  }
  else {
    $('#username').attr('value', lastUsername);
  }


  $('#username').keypress(function(e) {
    if (e.which == 13) {
      // TODO: Clear old stuff
      var username = $('#username').attr('value');
      localStorage.setItem('lastUsername', username);
      getBugs(username);
    }
  });
}

function getBugs(login) {
  var req = new XMLHttpRequest();
  var apiURL = 'https://api-dev.bugzilla.mozilla.org/1.1/';
  var url = apiURL + 'bug?' + encodeReqParams({
    email1: login,
    email1_type: 'equals',
    email1_assigned_to: 1,
    email1_creator: 1,
    email1_comment_author: 1,
    changed_after: '7d',
    /*include_fields: 'id,creator,assigned_to,summary,keywords,whiteboard,status,resolution'*/
    include_fields: 'id,summary,creator,assigned_to,creation_time,status,resolution,attachments'
    /*email1_comment_author: 1*/ // broken, bug 743275
  });

  if (!$('#nocache').attr('checked')) {
    var cachedResult = localStorage.getItem(url);
    if (cachedResult) {
      console.debug('Got cached value!');
      displayBugs(JSON.parse(cachedResult), login);
      return;
    }
  }

  req.open('GET', url, /* async = */ true);
  req.setRequestHeader('Accept', 'application/json');
  req.onreadystatechange = function(e) {
    if (req.readyState == 4) {
      getBugsFinished(url, req, login);
    }
  };
  req.send();
}

function encodeReqParams(dict) {
  var ret = "";
  for (k in dict) {
    ret += k + '=' + encodeURIComponent(dict[k]) + '&';
  }
  return ret;
}

function getBugsFinished(url, req, login) {
  if (req.status >= 300 || req.status < 200) {
    $('#requestOutput').text('Error ' + req.status + ' ' + req.responseText);
    return;
  }

  try {
    var bugs = JSON.parse(req.responseText);
  }
  catch(e) {
    $('#requestOutput').text('Received invalid JSON: ' + req.responseText);
  }

  localStorage.setItem(url, JSON.stringify(bugs.bugs));
  displayBugs(bugs.bugs, login);
}

function displayBugs(bugs, login) {
  var now = Date.now();
  var weekMS = 7 * 24 * 60 * 60 * 1000;

  var outBugs = [];

  for (var i = 0; i < bugs.length; i++) {
    var bug = bugs[i];
    bug.reasons = [];
    bug.reviews = new Bag();
    bug.creation_time = new Date(bug.creation_time);

    var addedToOutBugs = false;
    function addToOutBugs() {
      if (!addedToOutBugs) {
        outBugs.push(bug);
        addedToOutBugs = true;
      }
    }

    if (bug.resolution == 'DUPLICATE' || bug.resolution == 'INVALID')
      continue;

    if (bug.creator.name == 'justin.lebar+bug' &&
        (now - bug.creation_time.getTime()) <= weekMS) {
      bug.reasons.push('filed');
      addToOutBugs();
    }

    if (bug.attachments) {
      for (var j = 0; j < bug.attachments.length; j++) {
        var attachment = bug.attachments[j];
        attachment.creation_time = new Date(bug.creation_time);

        if (attachment.attacher.name == 'justin.lebar+bug' &&
            attachment.is_obsolete == 0 &&
            attachment.is_patch == 1 &&
            (now - attachment.creation_time.getTime()) <= weekMS) {

          for (var k = 0; attachment.flags && k < attachment.flags.length; k++) {
            var flag = attachment.flags[k];
            if (flag.name == 'review') {
              var person;
              if (flag.requestee) {
                person = flag.requestee.name;
              }
              else if (flag.setter) {
                person = flag.setter.name;
              }
              else {
                person = "(nobody)";
              }
              addToOutBugs();
              bug.reviews.add('r' + flag.status + person);
            }
          }
        }
      }
    }

    bug.reviews = bug.reviews.toArray();
    for (var j = 0; j < bug.reviews.length; j++) {
      var review = bug.reviews[j];
      if (review.count > 1) {
        review.showCount = true;
      }
    }

    if (bug.reviews.length) {
      bug.reasons.push('patch');
    }

    if (bug.reasons.length) {
      bug.reason = '(' + bug.reasons.join(', ') + ')';
    }
    else {
      bug.reason = '';
    }
  }

  function compareBugId(a, b) {
    if (a.id < b.id) {
      return -1;
    }
    if (b.id < a.id) {
      return 1;
    }
    return 0;
  }

  outBugs.sort(compareBugId);

  $('#newBugsList').html(templates.bugs({bugs: outBugs}));
}
