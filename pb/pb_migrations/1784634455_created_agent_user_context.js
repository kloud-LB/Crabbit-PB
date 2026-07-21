/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "user_id = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text2809058197",
        "max": 0,
        "min": 0,
        "name": "user_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text3333333301",
        "max": 0,
        "min": 0,
        "name": "habits",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text3333333302",
        "max": 0,
        "min": 0,
        "name": "preferences",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text3333333303",
        "max": 0,
        "min": 0,
        "name": "recent_topics",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "autodate3333333304",
        "max": 0,
        "min": 0,
        "name": "updated_at",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "autodate",
        "onCreate": true,
        "onUpdate": true
      }
    ],
    "id": "pbc_3000000003",
    "indexes": [
      "CREATE UNIQUE INDEX idx_auc_user ON agent_user_context(user_id)"
    ],
    "listRule": "user_id = @request.auth.id",
    "name": "agent_user_context",
    "system": false,
    "type": "base",
    "updateRule": "user_id = @request.auth.id",
    "viewRule": "user_id = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3000000003");
  return app.delete(collection);
})
