-- 0001_init.sql — scene, scene_version and share_link tables.
-- Never edit an applied migration; add a new file instead.

CREATE TABLE scene (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived   boolean NOT NULL DEFAULT false
);

CREATE TABLE scene_version (
    scene_id       text NOT NULL REFERENCES scene (id) ON DELETE CASCADE,
    version        integer NOT NULL,
    parent_version integer,
    created_at     timestamptz NOT NULL DEFAULT now(),
    author         text NOT NULL,
    message        text NOT NULL,
    content_hash   text NOT NULL,
    doc            jsonb NOT NULL,
    PRIMARY KEY (scene_id, version)
);

CREATE INDEX scene_version_scene_id_version_desc_idx ON scene_version (scene_id, version DESC);

CREATE TABLE share_link (
    token      text PRIMARY KEY,
    scene_id   text NOT NULL REFERENCES scene (id) ON DELETE CASCADE,
    version    integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked    boolean NOT NULL DEFAULT false
);

CREATE INDEX share_link_scene_id_idx ON share_link (scene_id);
