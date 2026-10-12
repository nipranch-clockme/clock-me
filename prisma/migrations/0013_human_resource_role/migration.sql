-- Human Resource role (logs admin time on the Internal client's projects, not a resource, sees team utilisation) and Guest (third-party contractors, Team member access, not a resource).

-- CreateEnum value
ALTER TYPE "Role" ADD VALUE 'HUMAN_RESOURCE';
ALTER TYPE "Role" ADD VALUE 'GUEST';
