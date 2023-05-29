function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VAMS')
    .addItem('Batch Upload', 'showUpload')
    .addToUi();
}

function showUpload() {
  var html = HtmlService.createTemplateFromFile('html/sidebar').evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  SpreadsheetApp.getUi().showSidebar(html);
}

function get_html(html) {
  return HtmlService.createHtmlOutputFromFile(html).getContent()
}

function get_cred() {
  var cred = PropertiesService.getUserProperties().getProperty('cred');
  if (cred == null) { return ret_text(false, 'no saved credential found.') }
  else {
    var response = ret_text(true, 'saved credential loaded...');
    response.data = cred;
    return response
  }
}

function save_cred(input) {
  PropertiesService.getUserProperties().setProperty('cred', input);
  return ret_text(true, 'credential saved...')
}

function del_cred() {
  PropertiesService.getUserProperties().deleteProperty('cred');
  return ret_text(true, 'credential deleted...')
}

function add_template(search) {
  console.log(search)
  var template = get_template().filter(function (e) { return e.top == search });
  if (template.length > 0) { template = template.pop() }
  else { return ret_text(false, 'invalid template selection...') }
  var header = [];
  var top = [template.top];
  template.column.forEach(function (e, i) { if (top[i] == undefined) { top.push('') } });
  header.push(top);
  header.push(template.field);
  header.push(template.column);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var success = false;
  var number = ss.getSheets().filter(
    function (e) { return e.getSheetName().includes(template.name.replace(/\s+/g, '').toUpperCase()) }).length;
  var temp = ss.insertSheet();
  while (success != true) {
    var temp_name = template.name.replace(/\s+/g, '').toUpperCase() + '_' + ('00' + number).slice(-2);
    try {
      temp.setName(temp_name);
      success = true
    }
    catch { number = number + 1 }
  }
  temp.deleteColumns(2, temp.getMaxColumns() - 2)
  temp.deleteRows(3, temp.getMaxRows() - 100)
  temp.getRange(1, 1, header.length, header[0].length).setValues(header);
  temp.setFrozenRows(3);
  return ret_text(true, 'new template added ' + temp.getSheetName() + '...');
}

function check_template() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var active_ = ss.getActiveSheet();
    var active_data = active_.getDataRange().getDisplayValues();
    var check_list = get_template_check({ 'top': active_data[0][0] });
    if (check_list.length == 0) { return ret_text(false, 'invalid template...') }

    var header_check = check_list[0].check;
    var missing_header = header_check.filter(function (e) { return active_data[1].indexOf(e.field) == -1 });
    if (missing_header.length > 0) {
      return ret_text(false, missing_header.map(function (e) { return e.column }).join(',') + ' column(s) missing.')
    }
    return ret_text(true, 'template validated.')
  }
  catch (err) { return ret_text(false, err.toString()) }
}

function get_process_lines() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var active_ = ss.getActiveSheet();
    var active_name = active_.getSheetName();
    var active_data = active_.getDataRange().getDisplayValues();
    active_data = active_data.map(function (e, i) {
      var new_obj = e;
      new_obj.unshift(i + 1)
      return new_obj
    });
    active_data.shift();
    var header = active_data.shift();
    active_data.shift();
    console.log(active_data)
    active_data = active_data.filter(function (e) { return e[header.indexOf('status')] == '' });
    active_data = active_data.map(function (e) { return e[0] });
    if (active_data.length == 0) { return ret_text(false, 'template has no data suffice to upload...') }
    else { return ret_text(true, { lines: active_data.join('*'), sheet: active_name }) }
  }
  catch (err) { return ret_text(false, err.toString()) }
}

function process_line_template(line, sheet_name) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var active_ = ss.getSheetByName(sheet_name);
    var active_data = active_.getDataRange().getDisplayValues();
    var schema = active_data[0][0];
    var check_list = get_template_check({ 'top': schema }).pop().check.filter(
      function (e) { return e.field != 'status' }).map(
        function (e) { return e.field });
    active_data.shift();
    var header = active_data.shift();
    active_data.shift();

    var stat_res = header.indexOf('status');
    var sheet_id = ss.getId();
    active_data = [active_data[line - 4]].map(function (e, i) {
      var new_obj = {};
      var error = '';
      header.forEach(function (f, j, a) {
        if ((new RegExp('date', 'gi')).exec(f) !== null) {
          if (e[j].split('-').length < 3) {
            error = error + '\n ' + 'invalid date input';
            var date = 'invalid date input';
          }
          else {
            if (e[j].includes(':')) { var date = new Date(e[j]) }
            else { var date = new Date(e[j] + 'T00:00:00+00:00') }
          }
          if (date != 'Invalid Date') { new_obj[f] = date }
          else {
            if (error == '') { error = error + '\n ' + 'invalid date input' }
            e[stat_res] = error;
          }
        }
        else {
          if (check_list.indexOf(f) != -1 && e[j] == '') {
            error = error + '\n ' + f + ' missing';
            e[stat_res] = error;
          }
          else { new_obj[f] = e[j] }
        }
        new_obj['row'] = line;
        new_obj['sheet_id'] = sheet_id;
        new_obj['sheet_name'] = sheet_name;
        new_obj['status_response'] = stat_res + 1
      });
      if (error != '') { active_.getRange(line, stat_res + 1, 1, 1).setValue(error) }
      return new_obj
    });
    active_data = active_data.filter(function (e) { return e['status'] == '' });
    if (active_data.length == 0) { return ret_text(false, 'template has no data suffice to upload.') }

    var cred = get_cred();
    if (cred.status == false) { return ret_text(cred.status, cred.text) }

    var cred_test = test_auth(cred.data);
    if (cred_test.status == false) { return ret_text(cred_test.status, cred_test.text) }

    active_data.forEach(function (e) {
      var data_format = { schema: schema, data: e }
      console.log(data_format)
      upload_template(data_format)
    });
    return ret_text(true, 'row ' + line + ' of ' + sheet_name + ' upload completed')
  }
  catch (err) { return ret_text(false, err.toString()) }
}

function ret_text(stats, msg) {
  return {
    'status': stats,
    'text': msg
  }
}

function get_template() {
  schemas = get_schema_JSON();
  var data = schemas.map(function (e) {
    var column = [];
    var field = [];
    for (let i = 0; i < e.variable.length; i++) {
      var f = e.variable.filter(function (g) { return g.order == i })[0]
      if (f.required) { column.push(f.column + '*') }
      else { column.push(f.column) }
      field.push(f.field)
    }
    column.push('Upload Status');
    field.push('status');
    return {
      name: e.simple,
      top: e.name,
      column: column,
      field: field
    }
  });
  console.log(data)
  return data
}

function get_template_list() {
  schemas = get_schema_JSON();
  var data = schemas.map(function (e) {
    return {
      text: e.simple,
      value: e.name,
    }
  });
  var response = ret_text(true, 'template loaded...');
  response.data = data;
  return response
}

function get_template_check(query) {
  schemas = get_schema_JSON();
  var data = schemas.map(function (e) {
    var check = [];
    for (let i = 0; i < e.variable.length; i++) {
      var f = e.variable.filter(function (g) { return g.order == i })[0]
      if (f.required) {
        check.push({
          field: f.field,
          column: f.column
        })
      }
    }
    check.push({ field: 'status', column: 'Upload Status' });
    return {
      name: e.simple,
      top: e.name,
      check: check
    }
  });
  if (query instanceof Object) {
    if (query['top'] != undefined) { data = data.filter(function (e) { return e['top'] == query['top'] }) }
    if (query['name'] != undefined) { data = data.filter(function (e) { return e['name'] == query['name'] }) }
  }
  return data
}
