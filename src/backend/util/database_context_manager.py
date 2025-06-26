import logging
import aiomysql
from dotenv import load_dotenv
from .config import global_config

logger = logging.getLogger(__name__)
load_dotenv()


class DBContextManager:
    """
    An async context manager for handling MySQL database connections.
    """

    mysql_db = global_config.mysql_database
    mysql_host = global_config.mysql_host
    mysql_user = global_config.mysql_user
    mysql_pass = global_config.mysql_pass

    def __init__(self, use_dict=False):
        self.use_dict = use_dict
        self.pool = None
        self.cur = None
        self.con = None

    async def __aenter__(self):
        # Create a pool of connections for database interaction
        self.pool = await aiomysql.create_pool(
            host=self.mysql_host,
            user=self.mysql_user,
            password=self.mysql_pass,
            db=self.mysql_db,
            autocommit=False  # Control commits manually
        )
        self.con = await self.pool.acquire()  # Acquire a connection from the pool
        self.cur = await self.con.cursor(aiomysql.DictCursor if self.use_dict else aiomysql.Cursor)
        return self.cur

    async def __aexit__(self, exc_type, exc_value, exc_traceback):
        try:
            if exc_type:
                # Log the error and rollback any pending transactions
                logger.error("Database error occurred: %s", exc_value)
                logger.debug("Traceback:", exc_info=(
                    exc_type, exc_value, exc_traceback))
                await self.con.rollback()
            else:
                # Commit changes if no error occurred
                await self.con.commit()
        finally:
            # Always close the cursor and release the connection back to the pool
            await self.cur.close()
            self.pool.release(self.con)
