import logging
import aiomysql
from dotenv import load_dotenv
from typing import Optional, Any, Type
from .config import global_config

logger = logging.getLogger(__name__)
load_dotenv()


class DBContextManager:
    """Async context manager for MySQL database connections.

    Provides automatic connection management, transaction handling,
    and proper cleanup for MySQL database operations.

    Attributes:
        mysql_db: Database name from configuration.
        mysql_host: Database host from configuration.
        mysql_user: Database username from configuration.
        mysql_pass: Database password from configuration.
        use_dict: Whether to use dictionary cursor for results.
        pool: Connection pool for database connections.
        cur: Database cursor for executing queries.
        con: Database connection from the pool.
    """

    mysql_db = global_config.mysql_database
    mysql_host = global_config.mysql_host
    mysql_user = global_config.mysql_user
    mysql_pass = global_config.mysql_pass

    def __init__(self, use_dict: bool = False) -> None:
        """Initialize the database context manager.

        Args:
            use_dict: Whether to return results as dictionaries (default: False).
        """
        self.use_dict: bool = use_dict
        self.pool: Optional[aiomysql.Pool] = None
        self.cur: Optional[aiomysql.Cursor] = None
        self.con: Optional[aiomysql.Connection] = None

    async def __aenter__(self) -> aiomysql.Cursor:
        """Enter the async context and establish database connection.

        Creates a connection pool, acquires a connection, and returns
        a cursor for database operations.

        Returns:
            Database cursor for executing queries.
        """
        self.pool = await aiomysql.create_pool(
            host=self.mysql_host,
            user=self.mysql_user,
            password=self.mysql_pass,
            db=self.mysql_db,
            autocommit=False
        )
        self.con = await self.pool.acquire()
        self.cur = await self.con.cursor(aiomysql.DictCursor if self.use_dict else aiomysql.Cursor)
        return self.cur

    async def __aexit__(self, exc_type: Optional[Type[BaseException]], exc_value: Optional[BaseException],
                        exc_traceback: Optional[Any]) -> None:
        """Exit the async context and handle cleanup.

        Commits or rolls back transactions based on whether an exception occurred,
        then closes the cursor and releases the connection back to the pool.

        Args:
            exc_type: Exception type if an error occurred.
            exc_value: Exception instance if an error occurred.
            exc_traceback: Exception traceback if an error occurred.
        """
        try:
            if exc_type:
                logger.error("Database error occurred: %s", exc_value)
                logger.debug("Traceback:", exc_info=(
                    exc_type, exc_value, exc_traceback))
                await self.con.rollback()
            else:
                await self.con.commit()
        finally:
            await self.cur.close()
            self.pool.release(self.con)
