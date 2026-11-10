-- DDL Chat tables. Run once in the existing DDL MySQL database.
-- All timestamps are Unix milliseconds (BIGINT) to avoid timezone issues between PHP, Node and the app.
-- user_id columns hold the DDL user id as a string (works for INT or UUID ids).

CREATE TABLE IF NOT EXISTS chat_users (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  role        ENUM('player','admin') NOT NULL DEFAULT 'player',
  avatar      VARCHAR(255) NULL,
  last_seen   BIGINT       NOT NULL DEFAULT 0,
  KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platforms (dartsmind, scolia, ...) each have their own rooms, friendlies, Dartswap and help desk.
-- room = 'general:<platform>' or 'dm:<platform>:<idA>:<idB>' (ids sorted)
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room        VARCHAR(140) NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  body        TEXT         NULL,
  image_url   VARCHAR(255) NULL,
  deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  BIGINT       NOT NULL,
  KEY idx_room_id (room, id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_friendlies (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform     VARCHAR(20)  NOT NULL,
  user_id      VARCHAR(64)  NOT NULL,
  format       ENUM('FT3','FT5','Other') NOT NULL,
  custom       VARCHAR(40)  NULL,
  game         VARCHAR(20)  NOT NULL DEFAULT '501',
  note         VARCHAR(120) NULL,
  status       ENUM('open','matched','cancelled') NOT NULL DEFAULT 'open',
  matched_with VARCHAR(64)  NULL,
  created_at   BIGINT       NOT NULL,
  KEY idx_platform_status (platform, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_swap (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform     VARCHAR(20)  NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  kind        ENUM('Sell','Swap','Wanted') NOT NULL,
  title       VARCHAR(70)  NOT NULL,
  price       VARCHAR(12)  NULL,
  cond        VARCHAR(20)  NOT NULL,
  descr       VARCHAR(400) NULL,
  image_url   VARCHAR(255) NULL,
  status      ENUM('open','done','deleted') NOT NULL DEFAULT 'open',
  created_at  BIGINT       NOT NULL,
  KEY idx_platform_status (platform, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_help (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform     VARCHAR(20)  NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  question    VARCHAR(300) NOT NULL,
  status      ENUM('open','solved','deleted') NOT NULL DEFAULT 'open',
  created_at  BIGINT       NOT NULL,
  KEY idx_platform_status (platform, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_help_answers (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  help_id     INT UNSIGNED NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  body        VARCHAR(1000) NOT NULL,
  created_at  BIGINT       NOT NULL,
  KEY idx_help (help_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per sanctioned user. 0 = not active.
CREATE TABLE IF NOT EXISTS chat_sanctions (
  user_id      VARCHAR(64) NOT NULL PRIMARY KEY,
  muted_until  BIGINT      NOT NULL DEFAULT 0,
  kicked_until BIGINT      NOT NULL DEFAULT 0,
  banned       TINYINT(1)  NOT NULL DEFAULT 0,
  updated_by   VARCHAR(64) NULL,
  updated_at   BIGINT      NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_mod_log (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id    VARCHAR(64)  NOT NULL,
  action      VARCHAR(20)  NOT NULL,
  target_id   VARCHAR(64)  NULL,
  detail      VARCHAR(255) NULL,
  created_at  BIGINT       NOT NULL,
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
