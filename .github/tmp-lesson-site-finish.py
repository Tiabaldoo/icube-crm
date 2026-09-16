from pathlib import Path

p = Path('src/frontend/crm-ui.js')
text = p.read_text()
old = """    const cards=events.map(function(e){
      const g=byId(state.groups,e.groupId); if(!g) return '';
      const site=byId(state.sites,g.siteId);
      return '<div class=\"teacher-card\" onclick=\"openUnifiedCalendarEvent(\\\''+e.key+'\\\',\\\'teacher\\\')\">'+
        '<div class=\"teacher-lesson-head\"><div><div class=\"teacher-time\">'+timeStart(e.time)+'</div><h3 style=\"margin:4px 0\">'+g.direction+'</h3><div class=\"muted\">'+g.name+'<br>'+(site?.name||'')+'</div></div><div>'+eventStatusHtml(e)+'</div></div>'+"""
new = """    const cards=events.map(function(e){
      const g=byId(state.groups,e.groupId); if(!g) return '';
      const siteName=e.lesson?.siteName||byId(state.sites,g.siteId)?.name||'';
      return '<div class=\"teacher-card\" onclick=\"openUnifiedCalendarEvent(\\\''+e.key+'\\\',\\\'teacher\\\')\">'+
        '<div class=\"teacher-lesson-head\"><div><div class=\"teacher-time\">'+timeStart(e.time)+'</div><h3 style=\"margin:4px 0\">'+g.direction+'</h3><div class=\"muted\">'+g.name+'<br>'+siteName+'</div></div><div>'+eventStatusHtml(e)+'</div></div>'+"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one teacherToday match, found {count}')
p.write_text(text.replace(old, new, 1))
