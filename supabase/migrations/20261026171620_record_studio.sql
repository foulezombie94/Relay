begin;
create extension if not exists pg_jsonschema with schema extensions;
-- BEGIN GENERATED RECORD CONFIG SCHEMAS
-- Snapshot of the Zod contracts; database constraints also protect direct REST writes.
create function relay_private.record_config_json_valid(config_kind text,spec jsonb)
returns boolean language sql immutable parallel safe security invoker set search_path='' as $fn$
 select case config_kind when 'layout' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "pinned": {
      "maxItems": 15,
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^(display_name|email|domain|stage|amount|currency|close_date|owner_id|attr_[a-z][a-z0-9_]{0,49})$"
      }
    },
    "groups": {
      "maxItems": 12,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "maxLength": 60
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "fields": {
            "maxItems": 100,
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(display_name|email|domain|stage|amount|currency|close_date|owner_id|attr_[a-z][a-z0-9_]{0,49})$"
            }
          }
        },
        "required": [
          "id",
          "title",
          "fields"
        ],
        "additionalProperties": false
      }
    },
    "sections": {
      "minItems": 1,
      "maxItems": 10,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "overview",
          "relations",
          "timeline",
          "notes",
          "tasks",
          "commitments",
          "activities",
          "documents",
          "contacts",
          "deals"
        ]
      }
    },
    "details": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "pinned",
    "groups",
    "sections",
    "details"
  ],
  "additionalProperties": false
}$schema$::json,spec),false)
when 'relation' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "target_object_id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "inverse": {
      "default": true,
      "type": "boolean"
    },
    "inverse_name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "multiple": {
      "default": true,
      "type": "boolean"
    },
    "inverse_multiple": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "target_object_id",
    "inverse",
    "inverse_name",
    "multiple",
    "inverse_multiple"
  ],
  "additionalProperties": false
}$schema$::json,spec),false)
when 'rollup' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "relation_id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "relation_side": {
      "default": "source",
      "type": "string",
      "enum": [
        "source",
        "target"
      ]
    },
    "calculation": {
      "type": "string",
      "enum": [
        "count",
        "sum_amount",
        "next_due"
      ]
    }
  },
  "required": [
    "relation_id",
    "relation_side",
    "calculation"
  ],
  "additionalProperties": false
}$schema$::json,spec),false)
when 'button' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "workflow_id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "confirmation": {
      "default": "Vérifiez l’aperçu avant de confirmer.",
      "type": "string",
      "maxLength": 500
    }
  },
  "required": [
    "workflow_id",
    "confirmation"
  ],
  "additionalProperties": false
}$schema$::json,spec),false)
when 'template' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "values": {
      "type": "object",
      "properties": {
        "display_name": {
          "type": "string",
          "maxLength": 200
        },
        "email": {
          "anyOf": [
            {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 320,
                  "format": "email",
                  "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
                },
                {
                  "type": "string",
                  "const": ""
                }
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "domain": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 200
            },
            {
              "type": "null"
            }
          ]
        },
        "stage": {
          "type": "string",
          "maxLength": 80
        },
        "amount": {
          "type": "number",
          "minimum": 0,
          "maximum": 10000000000000000
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "owner_id": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            {
              "type": "null"
            }
          ]
        },
        "close_date": {
          "anyOf": [
            {
              "type": "string",
              "format": "date",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
            },
            {
              "type": "null"
            }
          ]
        },
        "attributes": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "maxLength": 50
          },
          "additionalProperties": {}
        }
      },
      "additionalProperties": false
    },
    "content": {
      "default": "",
      "type": "string",
      "maxLength": 10000
    },
    "checklist": {
      "default": [],
      "maxItems": 40,
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 300
      }
    },
    "repeat": {
      "default": "none",
      "type": "string",
      "enum": [
        "none",
        "daily",
        "weekly",
        "monthly"
      ]
    },
    "repeat_start": {
      "default": null,
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "timezone": {
      "default": "Europe/Paris",
      "type": "string",
      "maxLength": 100
    }
  },
  "required": [
    "values",
    "content",
    "checklist",
    "repeat",
    "repeat_start",
    "timezone"
  ],
  "additionalProperties": false
}$schema$::json,spec),false)
when 'form' then coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "description": {
      "default": "",
      "type": "string",
      "maxLength": 2000
    },
    "questions": {
      "minItems": 1,
      "maxItems": 40,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "property": {
            "type": "string",
            "pattern": "^(display_name|email|domain|stage|amount|currency|close_date|owner_id|attr_[a-z][a-z0-9_]{0,49})$"
          },
          "label": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "description": {
            "default": "",
            "type": "string",
            "maxLength": 500
          },
          "type": {
            "type": "string",
            "enum": [
              "text",
              "textarea",
              "email",
              "url",
              "number",
              "date",
              "select",
              "checkbox"
            ]
          },
          "required": {
            "default": false,
            "type": "boolean"
          },
          "options": {
            "default": [],
            "maxItems": 100,
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 100
            }
          },
          "show_if": {
            "default": null,
            "anyOf": [
              {
                "type": "object",
                "properties": {
                  "question_id": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  "value": {
                    "type": "string",
                    "maxLength": 300
                  }
                },
                "required": [
                  "question_id",
                  "value"
                ],
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "id",
          "property",
          "label",
          "description",
          "type",
          "required",
          "options",
          "show_if"
        ],
        "additionalProperties": false
      }
    },
    "published": {
      "default": false,
      "type": "boolean"
    },
    "submit_label": {
      "default": "Envoyer",
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "success_message": {
      "default": "Merci, votre réponse a été enregistrée.",
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    }
  },
  "required": [
    "description",
    "questions",
    "published",
    "submit_label",
    "success_message"
  ],
  "additionalProperties": false
}$schema$::json,spec),false) else false end;
$fn$;
revoke all on function relay_private.record_config_json_valid(text,jsonb) from public,anon;
grant execute on function relay_private.record_config_json_valid(text,jsonb) to authenticated,service_role;
create function relay_private.record_template_values_valid(spec jsonb)
returns boolean language sql immutable parallel safe security invoker set search_path='' as $fn$
 select coalesce(extensions.jsonb_matches_schema($schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "display_name": {
      "type": "string",
      "maxLength": 200
    },
    "email": {
      "anyOf": [
        {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 320,
              "format": "email",
              "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
            },
            {
              "type": "string",
              "const": ""
            }
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "domain": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 200
        },
        {
          "type": "null"
        }
      ]
    },
    "stage": {
      "type": "string",
      "maxLength": 80
    },
    "amount": {
      "type": "number",
      "minimum": 0,
      "maximum": 10000000000000000
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "owner_id": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        {
          "type": "null"
        }
      ]
    },
    "close_date": {
      "anyOf": [
        {
          "type": "string",
          "format": "date",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "attributes": {
      "type": "object",
      "propertyNames": {
        "type": "string",
        "maxLength": 50
      },
      "additionalProperties": {}
    }
  },
  "additionalProperties": false
}$schema$::json,spec),false);
$fn$;
revoke all on function relay_private.record_template_values_valid(jsonb) from public,anon;
grant execute on function relay_private.record_template_values_valid(jsonb) to authenticated,service_role;
-- END GENERATED RECORD CONFIG SCHEMAS
create table public.record_configs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 object_id uuid not null, kind text not null check(kind in ('layout','relation','rollup','button','template','form')),
 name text not null check(length(btrim(name)) between 1 and 160),
 config jsonb not null check(octet_length(config::text)<60000 and relay_private.record_config_json_valid(kind,config)),
 share_key uuid not null unique default gen_random_uuid(), created_by uuid not null default auth.uid() references auth.users(id),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,object_id) references public.objects(workspace_id,id) on delete cascade
);
create index record_configs_object_idx on public.record_configs(workspace_id,object_id,kind);
create unique index record_configs_layout_idx on public.record_configs(workspace_id,object_id) where kind='layout';
create index record_configs_relation_target_idx on public.record_configs(workspace_id,(config->>'target_object_id')) where kind='relation';
alter table public.record_configs enable row level security;
create policy record_configs_read on public.record_configs for select to authenticated using(relay_private.has_role(workspace_id));
create policy record_configs_insert on public.record_configs for insert to authenticated with check(relay_private.has_role(workspace_id,array['owner','admin']) and created_by=(select auth.uid()));
create policy record_configs_update on public.record_configs for update to authenticated using(relay_private.has_role(workspace_id,array['owner','admin'])) with check(relay_private.has_role(workspace_id,array['owner','admin']));
create policy record_configs_delete on public.record_configs for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
revoke all on public.record_configs from public,anon,authenticated;
grant select,insert,update,delete on public.record_configs to authenticated,service_role;

-- Attribute definitions can change after a template was saved. Validate again at
-- execution, as well as at configuration time. This function never bypasses RLS.
create function relay_private.record_values_validate(w uuid, object uuid, record_values jsonb, require_fields boolean default true)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.attributes; pair record; value jsonb; text_value text; valid boolean;
begin
 if jsonb_typeof(record_values) is distinct from 'object' then raise exception 'Valeurs de fiche invalides' using errcode='22023'; end if;
 if not relay_private.record_template_values_valid(record_values) then raise exception 'Champs prédéfinis invalides' using errcode='22023'; end if;
 if record_values->>'close_date' is not null then perform (record_values->>'close_date')::date; end if;
 if record_values->>'owner_id' is not null and not exists(select 1 from public.memberships where workspace_id=w and user_id=(record_values->>'owner_id')::uuid) then raise exception 'Responsable inaccessible' using errcode='22023'; end if;
 for pair in select * from jsonb_each(coalesce(record_values->'attributes','{}')) loop
  select * into a from public.attributes where workspace_id=w and object_id=object and key=pair.key and not archived;
  if a.id is null then raise exception 'Attribut absent ou archivé' using errcode='22023'; end if;
  value:=pair.value; text_value:=value#>>'{}';
  if value='null'::jsonb or value='""'::jsonb then continue; end if;
  valid:=case a.type
   when 'number' then jsonb_typeof(value)='number'
   when 'money' then jsonb_typeof(value)='number'
   when 'boolean' then jsonb_typeof(value)='boolean'
   when 'email' then jsonb_typeof(value)='string' and text_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   when 'phone' then jsonb_typeof(value)='string' and text_value ~ '^\+?[0-9 ().-]+$' and length(regexp_replace(text_value,'[^0-9]','','g')) between 6 and 15
   when 'url' then jsonb_typeof(value)='string' and text_value ~ '^https?://[^[:space:]/]+'
   when 'select' then jsonb_typeof(value)='string' and a.options @> jsonb_build_array(value)
   when 'multi_select' then jsonb_typeof(value)='array' and not exists(select 1 from jsonb_array_elements(value) v where jsonb_typeof(v)<>'string' or not a.options @> jsonb_build_array(v))
   when 'date' then jsonb_typeof(value)='string' and text_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   when 'datetime' then jsonb_typeof(value)='string'
   when 'relation' then jsonb_typeof(value)='string' and text_value ~ '^[0-9a-fA-F-]{36}$'
   when 'user' then jsonb_typeof(value)='string' and text_value ~ '^[0-9a-fA-F-]{36}$'
   when 'formula' then false
   else jsonb_typeof(value)='string' and length(text_value)<=10000 end;
  if not coalesce(valid,false) then raise exception 'Type de propriété invalide' using errcode='22023'; end if;
  if a.type='date' then perform text_value::date; end if;
  if a.type='datetime' then perform text_value::timestamptz; end if;
  if a.type='relation' and not exists(select 1 from public.records where workspace_id=w and id=text_value::uuid and not archived and merged_into is null) then raise exception 'Fiche liée inaccessible' using errcode='22023'; end if;
  if a.type='user' and not exists(select 1 from public.memberships where workspace_id=w and user_id=text_value::uuid) then raise exception 'Utilisateur inaccessible' using errcode='22023'; end if;
 end loop;
 if require_fields and exists(select 1 from public.attributes where workspace_id=w and object_id=object and not archived and required and (not coalesce(record_values->'attributes','{}') ? key or coalesce(btrim(record_values->'attributes'->>key),'')='')) then raise exception 'Une propriété obligatoire est absente' using errcode='22023'; end if;
end $$;
revoke all on function relay_private.record_values_validate(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function relay_private.record_values_validate(uuid,uuid,jsonb,boolean) to authenticated,service_role;

create function relay_private.record_config_validate() returns trigger language plpgsql security invoker set search_path='' as $$
declare fields text[]:='{}'; f text; q jsonb; seen text[]:='{}'; properties text[]:='{}'; a public.attributes; r public.record_configs;
begin
 if not relay_private.record_config_json_valid(new.kind,new.config) then raise exception 'Configuration JSON invalide' using errcode='22023'; end if;
 if new.kind='relation' and not exists(select 1 from public.objects where workspace_id=new.workspace_id and id=(new.config->>'target_object_id')::uuid) then raise exception 'Objet de relation inaccessible' using errcode='22023'; end if;
 if new.kind='rollup' then
  select * into r from public.record_configs where workspace_id=new.workspace_id and id=(new.config->>'relation_id')::uuid and kind='relation';
  if r.id is null or not (r.object_id=new.object_id or ((r.config->>'inverse')::boolean and r.config->>'target_object_id'=new.object_id::text)) then raise exception 'Relation du calcul inaccessible' using errcode='22023'; end if;
 end if;
 if new.kind='button' and not exists(select 1 from public.workflows where workspace_id=new.workspace_id and id=(new.config->>'workflow_id')::uuid and definition->>'object_id'=new.object_id::text) then raise exception 'Workflow incompatible' using errcode='22023'; end if;
 if new.kind='template' then
  if not exists(select 1 from pg_timezone_names where name=new.config->>'timezone') then raise exception 'Fuseau horaire invalide' using errcode='22023'; end if;
  if new.config->>'repeat'<>'none' and new.config->>'repeat_start' is null then raise exception 'Début de récurrence requis' using errcode='22023'; end if;
  perform relay_private.record_values_validate(new.workspace_id,new.object_id,new.config->'values',new.config->>'repeat'<>'none');
 end if;
 if new.kind='layout' then
  select array_agg(value) into fields from (select jsonb_array_elements_text(new.config->'pinned') value union all select jsonb_array_elements_text(g->'fields') from jsonb_array_elements(new.config->'groups') g) p;
  if (select count(*)<>count(distinct value) from jsonb_array_elements_text(new.config->'pinned')) or (select count(*)<>count(distinct value) from jsonb_array_elements_text(new.config->'sections')) or (select count(*)<>count(distinct g->>'id') from jsonb_array_elements(new.config->'groups') g) then raise exception 'Éléments de disposition en double' using errcode='22023'; end if;
 elsif new.kind='form' then
  for q in select * from jsonb_array_elements(new.config->'questions') loop
   if q->>'id'=any(seen) or q->>'property'=any(properties) or (q->'show_if'<>'null'::jsonb and not (q->'show_if'->>'question_id'=any(seen))) then raise exception 'Questions ou conditions invalides' using errcode='22023'; end if;
   if q->>'property' in ('stage','owner_id','currency') then raise exception 'Propriété interne interdite' using errcode='22023'; end if;
   seen:=array_append(seen,q->>'id'); properties:=array_append(properties,q->>'property');
   if q->>'property' like 'attr\_%' escape '\' then
    select * into a from public.attributes where workspace_id=new.workspace_id and object_id=new.object_id and key=substr(q->>'property',6) and not archived;
    if a.id is null or not (case a.type when 'number' then q->>'type'='number' when 'money' then q->>'type'='number' when 'boolean' then q->>'type'='checkbox' when 'date' then q->>'type'='date' when 'email' then q->>'type'='email' when 'url' then q->>'type'='url' when 'select' then q->>'type'='select' and a.options @> (q->'options') else a.type in ('text','phone','location') and q->>'type' in ('text','textarea') end) then raise exception 'Type de question incompatible' using errcode='22023'; end if;
   elsif not (case q->>'property' when 'display_name' then q->>'type'='text' when 'email' then q->>'type'='email' when 'domain' then q->>'type' in ('text','url') when 'amount' then q->>'type'='number' when 'close_date' then q->>'type'='date' else false end) then raise exception 'Type de question incompatible' using errcode='22023'; end if;
  end loop;
  fields:=properties;
  if not exists(select 1 from jsonb_array_elements(new.config->'questions') q where q->>'property'='display_name' and (q->>'required')::boolean and q->'show_if'='null'::jsonb) then raise exception 'Le nom doit être requis et toujours visible' using errcode='22023'; end if;
 end if;
 foreach f in array coalesce(fields,'{}') loop
  if f not in ('display_name','email','domain','stage','amount','currency','close_date','owner_id') and not exists(select 1 from public.attributes where workspace_id=new.workspace_id and object_id=new.object_id and 'attr_'||key=f and not archived) then raise exception 'Propriété inexistante' using errcode='22023'; end if;
 end loop;
 return new;
end $$;
revoke all on function relay_private.record_config_validate() from public,anon,authenticated;
create trigger record_config_00_validate before insert or update on public.record_configs for each row execute function relay_private.record_config_validate();

alter table public.record_relations add column definition_id uuid;
alter table public.record_relations add constraint record_relations_definition_fk foreign key(workspace_id,definition_id) references public.record_configs(workspace_id,id) on delete cascade;
create unique index record_relations_typed_unique_idx on public.record_relations(definition_id,source_id,target_id) where definition_id is not null;
create index record_relations_definition_source_idx on public.record_relations(workspace_id,definition_id,source_id) where definition_id is not null;
create index record_relations_definition_target_idx on public.record_relations(workspace_id,definition_id,target_id) where definition_id is not null;

create function relay_private.record_relation_guard() returns trigger language plpgsql set search_path='' as $$
declare c public.record_configs; s uuid; t uuid;
begin
 if new.definition_id is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.definition_id::text,0));
 select * into c from public.record_configs where workspace_id=new.workspace_id and id=new.definition_id and kind='relation';
 if c.id is null then raise exception 'Relation inaccessible' using errcode='22023'; end if;
 select object_id into s from public.records where workspace_id=new.workspace_id and id=new.source_id and not archived and merged_into is null;
 select object_id into t from public.records where workspace_id=new.workspace_id and id=new.target_id and not archived and merged_into is null;
 if s is distinct from c.object_id or t is distinct from (c.config->>'target_object_id')::uuid then raise exception 'Objets de relation invalides' using errcode='22023'; end if;
 if not coalesce((c.config->>'multiple')::boolean,true) and exists(select 1 from public.record_relations where definition_id=c.id and source_id=new.source_id and id<>new.id) then raise exception 'Une seule fiche est autorisée pour cette relation' using errcode='23505'; end if;
 if not coalesce((c.config->>'inverse_multiple')::boolean,true) and exists(select 1 from public.record_relations where definition_id=c.id and target_id=new.target_id and id<>new.id) then raise exception 'La relation réciproque accepte une seule fiche' using errcode='23505'; end if;
 return new;
end $$;
create trigger record_relation_guard before insert or update on public.record_relations for each row execute function relay_private.record_relation_guard();

create function relay_private.record_config_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.workspace_id<>old.workspace_id or new.object_id<>old.object_id or new.kind<>old.kind or new.created_by<>old.created_by or new.share_key<>old.share_key then raise exception 'Configuration immuable' using errcode='22023'; end if;
 if old.kind='relation' then
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,0));
  if new.config->>'target_object_id' is distinct from old.config->>'target_object_id' and exists(select 1 from public.record_relations where definition_id=old.id) then raise exception 'Dissociez les fiches avant de changer la cible' using errcode='22023'; end if;
  if not coalesce((new.config->>'multiple')::boolean,true) and exists(select 1 from public.record_relations where definition_id=old.id group by source_id having count(*)>1) then raise exception 'Plusieurs fiches sont déjà liées' using errcode='23505'; end if;
  if not coalesce((new.config->>'inverse_multiple')::boolean,true) and exists(select 1 from public.record_relations where definition_id=old.id group by target_id having count(*)>1) then raise exception 'Plusieurs liens réciproques existent déjà' using errcode='23505'; end if;
 end if;
 new.version:=old.version+1; new.updated_at:=now(); return new;
end $$;
create trigger record_config_guard before update on public.record_configs for each row execute function relay_private.record_config_guard();

create function public.record_link_change(w uuid, definition uuid, record uuid, target uuid, unlink boolean default false, inverse_direction boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.record_configs; object uuid; source_id uuid; target_id uuid;
begin
 if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Lecture seule' using errcode='42501'; end if;
 select * into c from public.record_configs where workspace_id=w and id=definition and kind='relation';
 select object_id into object from public.records where workspace_id=w and id=record and not archived and merged_into is null;
 if c.id is null or object is null then raise exception 'Relation inaccessible' using errcode='42501'; end if;
 if object=c.object_id and not inverse_direction then source_id:=record; target_id:=target;
 elsif object=(c.config->>'target_object_id')::uuid and coalesce((c.config->>'inverse')::boolean,true) then source_id:=target; target_id:=record;
 else raise exception 'Cette relation ne concerne pas cet objet' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,0));
 if unlink then delete from public.record_relations r where r.workspace_id=w and r.definition_id=c.id and r.source_id=record_link_change.source_id and r.target_id=record_link_change.target_id;
 else insert into public.record_relations(workspace_id,source_id,target_id,label,definition_id) values(w,source_id,target_id,c.name,c.id) on conflict(definition_id,source_id,target_id) where definition_id is not null do nothing; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.record_link_change(uuid,uuid,uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.record_link_change(uuid,uuid,uuid,uuid,boolean,boolean) to authenticated;

create function public.record_rollups(w uuid, record uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare object uuid; c public.record_configs; relation public.record_configs; related uuid[]; amounts jsonb; due timestamptz; result jsonb:='[]';
begin
 select object_id into object from public.records where workspace_id=w and id=record and not archived and merged_into is null;
 if object is null then raise exception 'Fiche inaccessible' using errcode='42501'; end if;
 for c in select * from public.record_configs where workspace_id=w and object_id=object and kind='rollup' loop
  select * into relation from public.record_configs where workspace_id=w and id=(c.config->>'relation_id')::uuid and kind='relation';
  select array_agg(distinct p.id) into related from public.record_relations r join public.records p on p.workspace_id=w and p.id=case when r.source_id=record then r.target_id else r.source_id end where r.workspace_id=w and r.definition_id=relation.id and ((r.source_id=record and object=relation.object_id and (relation.object_id::text<>relation.config->>'target_object_id' or c.config->>'relation_side'='source')) or (r.target_id=record and object::text=relation.config->>'target_object_id' and (relation.config->>'inverse')::boolean and (relation.object_id::text<>relation.config->>'target_object_id' or c.config->>'relation_side'='target'))) and not p.archived and p.merged_into is null;
  if c.config->>'calculation'='sum_amount' then
   select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'value',value::text)),'[]') into amounts from (select currency,sum(amount) value from public.records where workspace_id=w and id=any(related) group by currency order by currency) v;
   result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'amounts',amounts));
  elsif c.config->>'calculation'='next_due' then
   select min(due_date) into due from public.tasks where workspace_id=w and (record_id=any(related)) and status not in ('done','cancelled');
   result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'date',due));
  else result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'count',coalesce(cardinality(related),0))); end if;
 end loop;
 return result;
end $$;
revoke all on function public.record_rollups(uuid,uuid) from public,anon;
grant execute on function public.record_rollups(uuid,uuid) to authenticated;

create table public.record_config_attempts (
 workspace_id uuid not null references public.workspaces(id) on delete cascade, config_id uuid not null, attempt uuid not null,
 actor_id uuid not null references auth.users(id), record_id uuid not null, payload jsonb not null, created_at timestamptz not null default now(),
 primary key(config_id,attempt), foreign key(workspace_id,config_id) references public.record_configs(workspace_id,id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index record_config_attempts_workspace_idx on public.record_config_attempts(workspace_id,actor_id);
alter table public.record_config_attempts enable row level security;
create policy record_config_attempts_read on public.record_config_attempts for select to authenticated using(actor_id=(select auth.uid()) and relay_private.has_role(workspace_id));
create policy record_config_attempts_insert on public.record_config_attempts for insert to authenticated with check(actor_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']));
revoke all on public.record_config_attempts from public,anon,authenticated;
grant select,insert on public.record_config_attempts to authenticated;
grant all on public.record_config_attempts to service_role;

create function public.record_template_apply(w uuid, configuration uuid, payload jsonb, attempt uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.record_configs; previous public.record_config_attempts; created uuid; body text; record_values jsonb;
begin
 if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Lecture seule' using errcode='42501'; end if;
 select * into c from public.record_configs where workspace_id=w and id=configuration and kind='template';
 if c.id is null then raise exception 'Modèle inaccessible' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text||attempt::text,0));
 select * into previous from public.record_config_attempts where config_id=c.id and record_config_attempts.attempt=record_template_apply.attempt;
 if previous.record_id is not null then if previous.actor_id<>auth.uid() or previous.payload<>payload then raise exception 'Tentative différente' using errcode='40001'; end if; return previous.record_id; end if;
 if not relay_private.record_template_values_valid(payload) then raise exception 'Champs de création invalides' using errcode='22023'; end if;
 record_values:=coalesce(c.config->'values','{}')||payload;
 record_values:=jsonb_set(record_values,'{attributes}',coalesce(c.config->'values'->'attributes','{}')||coalesce(payload->'attributes','{}'));
 perform relay_private.record_values_validate(w,c.object_id,record_values,true);
 insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,attributes)
 values(w,c.object_id,coalesce(nullif(record_values->>'display_name',''),c.name),nullif(record_values->>'email',''),nullif(record_values->>'domain',''),coalesce(record_values->>'stage','Nouveau'),coalesce((record_values->>'amount')::numeric,0),coalesce(record_values->>'currency','EUR'),(record_values->>'owner_id')::uuid,(record_values->>'close_date')::date,record_values->'attributes') returning id into created;
 select concat_ws(E'\n',nullif(c.config->>'content',''),(select string_agg('☐ '||value,E'\n') from jsonb_array_elements_text(coalesce(c.config->'checklist','[]')))) into body;
 if length(body)>0 then insert into public.notes(workspace_id,record_id,title,content) values(w,created,c.name,body); end if;
 insert into public.record_config_attempts(workspace_id,config_id,attempt,actor_id,record_id,payload) values(w,c.id,attempt,auth.uid(),created,payload);
 return created;
end $$;
revoke all on function public.record_template_apply(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_template_apply(uuid,uuid,jsonb,uuid) to authenticated;

create table public.record_form_receipts (
 config_id uuid not null references public.record_configs(id) on delete cascade, attempt uuid not null,
 receipt uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), primary key(config_id,attempt)
);
create index record_form_receipts_time_idx on public.record_form_receipts(config_id,created_at);
alter table public.record_form_receipts enable row level security;
revoke all on public.record_form_receipts from public,anon,authenticated;
grant all on public.record_form_receipts to service_role;
create function public.record_form_submit(configuration uuid,payload jsonb,attempt uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.record_configs; receipt uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(configuration::text,0));
 select * into c from public.record_configs where id=configuration and kind='form' and config->>'published'='true';
 if c.id is null or not exists(select 1 from public.memberships where workspace_id=c.workspace_id and user_id=c.created_by and role in ('owner','admin','member')) then raise exception 'Formulaire indisponible' using errcode='42501'; end if;
 select r.receipt into receipt from public.record_form_receipts r where config_id=c.id and r.attempt=record_form_submit.attempt;
 if receipt is not null then return receipt; end if;
 if (select count(*) from public.record_form_receipts where config_id=c.id and created_at>now()-interval '1 minute')>=10 or (select count(*) from public.record_form_receipts where config_id=c.id and created_at>now()-interval '1 day')>=500 then raise exception 'Trop de réponses, réessayez plus tard' using errcode='53300'; end if;
 perform set_config('request.jwt.claim.sub',c.created_by::text,true);
 insert into public.records(workspace_id,object_id,display_name,email,domain,amount,close_date,attributes) values(c.workspace_id,c.object_id,payload->>'display_name',nullif(payload->>'email',''),nullif(payload->>'domain',''),coalesce((payload->>'amount')::numeric,0),(payload->>'close_date')::date,coalesce(payload->'attributes','{}'));
 insert into public.record_form_receipts(config_id,attempt) values(c.id,attempt) returning record_form_receipts.receipt into receipt;
 return receipt;
end $$;
revoke all on function public.record_form_submit(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_form_submit(uuid,jsonb,uuid) to service_role;

create table public.record_template_schedules (
 config_id uuid primary key references public.record_configs(id) on delete cascade,
 next_run timestamptz not null, failure_count integer not null default 0 check(failure_count between 0 and 5),
 paused boolean not null default false, last_error_code text check(last_error_code ~ '^[A-Z0-9]{5}$'),
 last_failed_at timestamptz, last_succeeded_at timestamptz
);
create index record_template_schedules_due_idx on public.record_template_schedules(next_run,config_id) where not paused;
alter table public.record_template_schedules enable row level security;
revoke all on public.record_template_schedules from public,anon,authenticated;
create policy record_template_schedules_read on public.record_template_schedules for select to authenticated using(exists(select 1 from public.record_configs c where c.id=config_id and relay_private.has_role(c.workspace_id,array['owner','admin'])));
grant select on public.record_template_schedules to authenticated;
grant all on public.record_template_schedules to service_role;
-- Scheduling metadata is maintained by this narrow trigger, never by browser clients.
create function relay_private.record_template_schedule_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind<>'template' then return new; end if;
 if new.config->>'repeat'='none' then delete from public.record_template_schedules where config_id=new.id;
 elsif tg_op='INSERT' then
  insert into public.record_template_schedules(config_id,next_run) values(new.id,(new.config->>'repeat_start')::timestamptz);
 elsif new.config is distinct from old.config then
  insert into public.record_template_schedules(config_id,next_run) values(new.id,(new.config->>'repeat_start')::timestamptz)
  on conflict(config_id) do update set
   next_run=case when record_template_schedules.paused or new.config->>'repeat_start' is distinct from old.config->>'repeat_start' or new.config->>'repeat' is distinct from old.config->>'repeat' or new.config->>'timezone' is distinct from old.config->>'timezone' then excluded.next_run else record_template_schedules.next_run end,
   failure_count=0, paused=false, last_error_code=null, last_failed_at=null;
 end if;
 return new;
end $$;
revoke all on function relay_private.record_template_schedule_sync() from public,anon,authenticated;
create trigger record_template_schedule_sync after insert or update on public.record_configs for each row execute function relay_private.record_template_schedule_sync();
create function relay_private.record_next_occurrence(anchor timestamptz,frequency text,zone text,now_at timestamptz) returns timestamptz language plpgsql stable set search_path='' as $$
declare start_at timestamp:=anchor at time zone zone; current_at timestamp:=now_at at time zone zone; n integer; next_at timestamp;
begin
 if frequency='monthly' then n:=greatest(1,(extract(year from current_at)::integer-extract(year from start_at)::integer)*12+extract(month from current_at)::integer-extract(month from start_at)::integer); next_at:=start_at+n*interval '1 month'; if next_at<=current_at then next_at:=start_at+(n+1)*interval '1 month'; end if;
 elsif frequency='weekly' then n:=greatest(1,(current_at::date-start_at::date)/7); next_at:=start_at+n*interval '1 week'; if next_at<=current_at then next_at:=start_at+(n+1)*interval '1 week'; end if;
 else n:=greatest(1,current_at::date-start_at::date); next_at:=start_at+n*interval '1 day'; if next_at<=current_at then next_at:=start_at+(n+1)*interval '1 day'; end if; end if;
 return next_at at time zone zone;
end $$;
revoke all on function relay_private.record_next_occurrence(timestamptz,text,text,timestamptz) from public,anon,authenticated;
grant execute on function relay_private.record_next_occurrence(timestamptz,text,text,timestamptz) to service_role;
create function public.record_studio_tick() returns integer language plpgsql security invoker set search_path='' as $$
declare c public.record_configs; due record; done integer:=0; body text; created uuid; record_values jsonb;
 original_subject text:=current_setting('request.jwt.claim.sub',true);
begin
 for due in select s.config_id,s.next_run,s.failure_count from public.record_template_schedules s join public.record_configs cfg on cfg.id=s.config_id where not s.paused and s.next_run<=now() and cfg.kind='template' and cfg.config->>'repeat' in ('daily','weekly','monthly') and exists(select 1 from public.memberships m where m.workspace_id=cfg.workspace_id and m.user_id=cfg.created_by and m.role in ('owner','admin','member')) order by s.next_run,s.config_id limit 200 for update of s skip locked loop
  -- Each block is a subtransaction. A failed record/note is rolled back by
  -- itself; successful templates in the batch are preserved.
  begin
   select * into strict c from public.record_configs where id=due.config_id;
   if not relay_private.record_config_json_valid(c.kind,c.config) then raise exception 'Modèle invalide' using errcode='22023'; end if;
   perform set_config('request.jwt.claim.sub',c.created_by::text,true);
   record_values:=c.config->'values';
   perform relay_private.record_values_validate(c.workspace_id,c.object_id,record_values,true);
   insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,attributes)
   values(c.workspace_id,c.object_id,coalesce(nullif(record_values->>'display_name',''),c.name),nullif(record_values->>'email',''),nullif(record_values->>'domain',''),coalesce(record_values->>'stage','Nouveau'),coalesce((record_values->>'amount')::numeric,0),coalesce(record_values->>'currency','EUR'),(record_values->>'owner_id')::uuid,(record_values->>'close_date')::date,coalesce(record_values->'attributes','{}')) returning id into created;
   body:=concat_ws(E'\n',nullif(c.config->>'content',''),(select string_agg('☐ '||value,E'\n') from jsonb_array_elements_text(coalesce(c.config->'checklist','[]'))));
   if length(body)>0 then insert into public.notes(workspace_id,record_id,title,content) values(c.workspace_id,created,c.name,body); end if;
   update public.record_template_schedules set next_run=relay_private.record_next_occurrence((c.config->>'repeat_start')::timestamptz,c.config->>'repeat',c.config->>'timezone',now()),failure_count=0,paused=false,last_error_code=null,last_failed_at=null,last_succeeded_at=now() where config_id=c.id;
   done:=done+1;
  exception when others then
   -- Persist only SQLSTATE, never exception text that could contain CRM data.
   -- Retry after 1/2/4/8 minutes, then pause on the fifth failure. Saving a
   -- corrected configuration resets this state and reactivates the schedule.
   update public.record_template_schedules set failure_count=due.failure_count+1,
    paused=due.failure_count+1>=5,last_error_code=sqlstate,last_failed_at=now(),
    next_run=now()+make_interval(mins=>power(2,due.failure_count)::integer)
    where config_id=due.config_id;
  end;
  perform set_config('request.jwt.claim.sub',coalesce(original_subject,''),true);
 end loop;
 return done;
end $$;
revoke all on function public.record_studio_tick() from public,anon,authenticated;
grant execute on function public.record_studio_tick() to service_role;
-- Runs without a browser session, web server, or Node worker. A stable job
-- name ensures pg_cron updates this schedule rather than creating duplicates.
create extension if not exists pg_cron;
select cron.schedule('relay-record-studio-tick','* * * * *','select public.record_studio_tick()');
commit;
