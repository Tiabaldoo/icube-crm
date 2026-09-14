-- Минимальные системные справочники, необходимые первому API-срезу.
-- Повторный запуск безопасен и не меняет существующие записи.
INSERT INTO directions (code, name, active)
SELECT 'robotics', 'Робототехника', TRUE
WHERE NOT EXISTS (SELECT 1 FROM directions WHERE code='robotics' OR name='Робототехника');

INSERT INTO directions (code, name, active)
SELECT 'programming', 'Программирование', TRUE
WHERE NOT EXISTS (SELECT 1 FROM directions WHERE code='programming' OR name='Программирование');

INSERT INTO projects (code, name, active)
SELECT 'icube-robots', 'iCubeRobots', TRUE
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE code='icube-robots' OR name='iCubeRobots');

INSERT INTO projects (code, name, active)
SELECT 'zebra', 'Зебра', TRUE
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE code='zebra' OR name='Зебра');
