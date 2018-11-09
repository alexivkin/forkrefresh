$(function() {
  Handlebars.registerHelper("debug", function(optionalValue) {
    console.log("Current Context");
    console.log(this);
    if (optionalValue) {
      console.log("Value");
      console.log(optionalValue);
    }
  });
  var eventsources={}

  var [engine,user]=document.URL.split('/').slice(-2)
  // console.log(engine)
  $('#engine').text(engine=='gh'?"GitHub":"Bitbucket")
  $('#user').text(user)
  $("#check-all").click(()=>{
      $('input:checkbox[name=repomark]:not(:disabled)').prop('checked', true);
      // $('input:checkbox[name=repomark]').not(this).prop('checked', this.checked);
  });
  $("#uncheck-all").click(()=>{
      $('input:checkbox[name=repomark]:not(:disabled)').prop('checked', false);
  });
  var eventSourceUrl = document.URL + '/repos'
  var source = new EventSource(eventSourceUrl);

  source.addEventListener('repos', function(e) {
    var data = JSON.parse(e.data)
    var templateSource = $('#repo-template').html();
    var template = Handlebars.compile(templateSource);
    var repo = template({data});
    $('#repolist').append(repo);
    // repolist.append(data+'<br>')
    // attach triggers to the newly created buttons
  }, false);

  source.addEventListener('stats', function(e) {
    var data = JSON.parse(e.data)
    if (e.data == '"zeend"') {
      // console.log("We're done!")
      e.target.close() // identical to source.close()
      // make all remaining buttons clickable
      $("button[data-sync]").click(event => {
          if (event.target.id == 'sync-all'){
            $("input:checkbox[name=repomark]:checked").each((i,v)=>{
              syncRepo(v.id.substr(4),$('#btn-'+v.id.substr(4)).data("branch"),$('#btn-'+v.id.substr(4)).data("source-sha"))
            })
          } else if (event.target.id.indexOf('btn-')==0){
              syncRepo(event.target.id.substr(4),event.target.getAttribute("data-branch"),event.target.getAttribute("data-source-sha"))
          }
      })
      return
    }
    // console.log(data)
    if (!data.fork){
      $('#results-'+$.escapeSelector(data.name)).text("Original").addClass("text-secondary")
      return
    }
    if (!data.ahead && !data.behind) {
      $('#results-'+$.escapeSelector(data.name)).html(`Up to date with <b>${data.source.owner}/${data.source.name}</b> (${data.source.default_branch})`)
      $("#btn-"+$.escapeSelector(data.name)).hide()
      return
    }
    let status=[]
    if (data.ahead) {
      if (data.ahead == -1)  // indeterminate (changes lie beyond compare_window)
        status.push('More than '+data.compare_window +' commits ahead or behind')
      else
        status.push(data.ahead+' commits ahead')
    }
    if (data.behind){
      status.push(data.behind+' commits behind')
      $("#btn-"+$.escapeSelector(data.name)).attr('data-source-sha',data.source.sha)
    }
    let days=Math.ceil((new Date(data.source.updated_at) - new Date(data.updated_at))/1000/3600/24)
    status.push(`${Math.abs(days)} days ${days>0?'older':'newer'}`)
    status.push(`than <a class="text-dark bold" href="https://github.com/${data.source.owner}/${data.source.name}">${data.source.owner}/${data.source.name}</a> (${data.source.default_branch})`)
    $('#results-'+$.escapeSelector(data.name)).html(status.join(', '))
    if (data.ahead) {
      // $("#btn-"+$.escapeSelector(data.name)).html('<i class="fa fa-exclamation"></i>').prop("disabled",false)
      //     .removeAttr("data-sync").attr('data-toggle','tooltip').attr('data-placement','top').attr('title','Refusing to overwrite the fork')
      //     .click(()=>{ window.open('https://github.com/'+user+'/'+data.name,'_blank')})
          // $('[data-toggle="tooltip"]').tooltip() // a bit general, we could narrow it to just this result
      var popover = `<div class="row">
                  <div class="col-md-6 pr-0"><a class="btn btn-outline-info btn-sm" href="https://github.com/${user}/${data.name}/compare" target="_blank">See changes</a></div>
                  <div class="col-md-6 pl-0"><button id="fff-${data.name}/${data.default_branch}/${data.source.sha}" class="btn btn-outline-danger btn-sm">Discard changes</button></div>
                  </div>`
      $("#btn-"+$.escapeSelector(data.name)).html('<i class="fa fa-exclamation"></i>').prop("disabled",false)
              .removeAttr("data-sync").attr('data-toggle','popover').popover({placement: 'top', animation:true, content:popover, html:true})
              .on('shown.bs.popover',() => {
                  $("#fff-"+$.escapeSelector(`${data.name}/${data.default_branch}/${data.source.sha}`)).click(function cliker(event) {
                    syncRepo(event.target.id.substr(4).split('/')[0],event.target.id.substr(4).split('/')[1],event.target.id.substr(4).split('/')[2])
                    $("#btn-"+$.escapeSelector(data.name)).popover("hide")
                  })
              })
    } else {
      $("#btn-"+$.escapeSelector(data.name)).html('<i class="fa fa-fast-forward"></i>').prop("disabled",false)
      $('#chk-'+$.escapeSelector(data.name)).prop("disabled",false).prop('checked',true);
    }
  }, false);

  function syncRepo(fork,branch,sha){
    // console.log(`Syncing ${fork} to ${sha}`)
    var eventSourceUrl = `${document.URL}/${fork}/${branch}/${sha}/sync`
    $("#btn-"+$.escapeSelector(fork)).html('<i class="fa fa-cog fa-spin"></i>').prop("disabled",true)
    // not really needed to do the sse here, a simple 'get' would have sufficed
    var source = new EventSource(eventSourceUrl);
    source.addEventListener('sync', function(e) {
      var data = JSON.parse(e.data)
      if (e.data == '"zeend"') {
        // console.log("We're done!")
        $("#btn-"+$.escapeSelector(fork)).html('<i class="fa fa-check"></i>')
        e.target.close()
        return
      }
    }, false);
  }

})
