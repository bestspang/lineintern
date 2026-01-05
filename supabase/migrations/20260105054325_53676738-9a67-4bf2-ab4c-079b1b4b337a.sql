-- Insert admin role for nuti.lapa@gmail.com
INSERT INTO user_roles (user_id, role)
VALUES ('ad8f98a8-8700-49e1-851b-714a175bfa64', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;