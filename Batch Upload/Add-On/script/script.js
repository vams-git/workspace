
var logger = new Vue({
  el: ".logs-list",
  data: { items: [] },
  methods: {
    addNewLog: function (input) {
      if (input.type == undefined) { input.class = "" }
      else if (input.type) { input.class = "success" }
      else { input.class = "error" }
      this.items.unshift({
        message: this.now() + ": " + input.message,
        type: input.class
      });
    },
    now: function () { return new Date().toTimeString().substring(0, 8) },
    clear: function () { this.items = [] },
  },
});

var credential = new Vue({
  el: ".credential",
  data: {
    toggle: {
      form: true,
      password: true,
    },
    cred: {
      user_id: "",
      password: "",
      url: "https://eam-webservice.se2.inforcloudsuite.com/axis/services/EWSConnector",
      tenant: "VEOLIA1_TST",
      org: "*",
    },
    header: ["user_id", "password", "url", "tenant", "org"],
    disabled: false,
  },
  methods: {
    closeDisplay: function () { this.toggle.form = false },
    openDisplay: function () { this.toggle.form = true },
    toggleDisplay: function () { this.toggle.form = !this.toggle.form },
    toggleDisabled: function () { this.disabled = !this.disabled },
    togglePassword: function () { this.toggle.password = !this.toggle.password },
    submitData: function () {
      var inputs = this.cred;
      var data = this.header
        .map(function (e) { return inputs[e] })
        .filter(function (e) { return e == "" });
      if (data.length != 0) { logger.addNewLog({ message: "input incomplete", type: false }) }
      else {
        logger.addNewLog({ message: "saving credentials..." });
        google.script.run
          .withSuccessHandler(function (e) { logger.addNewLog({ message: e.text, type: e.status }) })
          .save_cred(JSON.stringify(inputs));
      }
    },
    resetData: function () {
      logger.addNewLog({ message: "removing saved credentials..." });
      this.cred = {
        user_id: "",
        password: "",
        url: "https://eam-webservice.se2.inforcloudsuite.com/axis/services/EWSConnector",
        tenant: "VEOLIA1_TST",
        org: "*",
      };
      google.script.run
        .withSuccessHandler(function (e) { logger.addNewLog({ message: e.text, type: e.status }) })
        .del_cred();
    },
    validateData: function (event) {
      template.closeDisplay();
      process.closeDisplay();
      var button = event.target;
      var children = [].slice.call(button.parentNode.children);
      children.forEach(function (e) { e.disabled = true });
      var input = document.querySelectorAll('input');
      input.forEach(function (e) { e.disabled = true });

      var inputs = this.cred;
      var data = this.header
        .map(function (e) { return inputs[e] })
        .filter(function (e) { return e == "" });

      var payload = { app: this, child: children, input: input };

      if (data.length != 0) { logger.addNewLog({ message: "input incomplete", type: false }) }
      else {
        logger.addNewLog({ message: "validating credentials..." });
        google.script.run
          .withSuccessHandler(function (e, b) {
            template.openDisplay();
            process.openDisplay();
            b.child.forEach(function (e) { e.disabled = false });
            b.input.forEach(function (e) { e.disabled = false });
            logger.addNewLog({ message: e.text, type: e.status });
            if (e.status === true) { b.app.toggleDisplay() }
          })
          .withUserObject(payload)
          .test_auth(JSON.stringify(inputs));
      }
    },
  },
});

var template = new Vue({
  el: ".template",
  data: {
    toggle: { form: true },
    selected: "",
    disabled: true,
    templates: [],
  },
  methods: {
    closeDisplay: function () { this.toggle.form = false },
    openDisplay: function () { this.toggle.form = true },
    toggleDisplay: function () { this.toggle.form = !this.toggle.form },
    createTemplate: function () {
      credential.toggle.form = false;
      var input = this.selected;
      if (input === "") { logger.addNewLog({ message: "pick a template", type: false }) }
      else {
        logger.addNewLog({ message: "creating template..." });
        google.script.run
          .withSuccessHandler(function (e) { logger.addNewLog({ message: e.text, type: e.status }) })
          .add_template(input);
      }
    },
  },
});

var process = new Vue({
  el: ".process",
  data: {
    toggle: { form: true },
    sheet: "",
    lines: [],
    disabled: {
      start: false,
      stop: true
    }
  },
  methods: {
    closeDisplay: function () { this.toggle.form = false },
    openDisplay: function () { this.toggle.form = true },
    toggleDisplay: function () { this.toggle.form = !this.toggle.form },
    stopUpload: function () {
      credential.toggle.form = false;
      logger.addNewLog({ message: "stopping upload..." });
      this.lines = [];
      this.sheet = "";
    },
    validateUpload: function () {
      template.closeDisplay();
      credential.closeDisplay();
      logger.addNewLog({ message: "validating current sheet format..." });
      google.script.run
        .withSuccessHandler(function (e) {
          if (e.status !== true) { logger.addNewLog({ message: e.text, type: e.status }) }
          else {
            logger.addNewLog({ message: "processing data lines..." });
            process.disabled.start = true;
            process.disabled.stop = false;
            google.script.run
              .withSuccessHandler(function (f) {
                if (f.status !== true) {
                  logger.addNewLog({ message: f.text, type: f.status });
                  process.disabled.start = false;
                  process.disabled.stop = true;
                }
                else {
                  process.lines = f.text.lines.split("*").map(function (g) {
                    return parseInt(g, 10);
                  });
                  process.sheet = f.text.sheet;
                  startUpload();
                }
              })
              .get_process_lines();
          }
        })
        .check_template();
    },
  },
});

function startUpload() {
  if (process.lines.length === 0 || process.sheet === "") {
    logger.addNewLog({ message: "no more lines to process..." });
    process.disabled.start = false;
    process.disabled.stop = true;
    process.sheet = "";
  }
  else {
    var line = process.lines.shift();
    var sheet = process.sheet;
    logger.addNewLog({ message: "processing row " + line + " of " + sheet + "..." });
    google.script.run
      .withSuccessHandler(function (e) { logger.addNewLog({ message: e.text, type: e.status }) })
      .process_line_template(line, sheet);
    setTimeout(startUpload, 1250);
  }
}

(function () {
  logger.addNewLog({ message: "loading saved credential..." });
  google.script.run
    .withSuccessHandler(function (e) {
      if (e.status == true) {
        var data = JSON.parse(e.data);
        Object.keys(data).forEach(function (f) { credential.cred[f] = data[f] });
        credential.toggleDisplay();
      }
      logger.addNewLog({ message: e.text, type: e.status });
      credential.disabled = false;

      google.script.run
        .withSuccessHandler(function (e) {
          logger.addNewLog({ message: e.text, type: e.status });
          template.templates = e.data;
          template.disabled = false;
        })
        .get_template_list();
    })
    .get_cred();
})();