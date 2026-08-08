import asyncio
import logging
import aiomysql
from dotenv import load_dotenv
from typing import Optional, Any, Type
from .config import global_config

logger = logging.getLogger(__name__)
load_dotenv()

# A single pool is shared by the whole application: the webserver, the Discord
# bot and the Twitch bot all borrow from it. Recycle connections well inside
# MySQL's default wait_timeout (8 hours) so long-idle connections are replaced
# rather than handed out dead.
POOL_MIN_SIZE = 1
POOL_MAX_SIZE = 20
POOL_RECYCLE_SECONDS = 3600


class DBContextManager:
    """Async context manager for MySQL database connections.

    Provides automatic connection management, transaction handling,
    and proper cleanup for MySQL database operations.

    Connections are borrowed from a single process-wide pool that is created on
    first use, so entering this context manager does not open a new pool.

    Attributes:
        mysql_db: Database name from configuration.
        mysql_host: Database host from configuration.
        mysql_user: Database username from configuration.
        mysql_pass: Database password from configuration.
        use_dict: Whether to use dictionary cursor for results.
        cur: Database cursor for executing queries.
        con: Database connection borrowed from the shared pool.
    """

    mysql_db = global_config.mysql_database
    mysql_host = global_config.mysql_host
    mysql_user = global_config.mysql_user
    mysql_pass = global_config.mysql_pass

    _pool: Optional[aiomysql.Pool] = None
    _pool_lock: asyncio.Lock = asyncio.Lock()

    def __init__(self, use_dict: bool = False) -> None:
        """Initialize the database context manager.

        Args:
            use_dict: Whether to return results as dictionaries (default: False).
        """
        self.use_dict: bool = use_dict
        self.cur: Optional[aiomysql.Cursor] = None
        self.con: Optional[aiomysql.Connection] = None

    @classmethod
    async def get_pool(cls) -> aiomysql.Pool:
        """Return the shared connection pool, creating it on first use.

        Returns:
            The process-wide aiomysql connection pool.
        """
        if cls._pool is not None and not cls._pool.closed:
            return cls._pool

        async with cls._pool_lock:
            # Another coroutine may have created the pool while we waited
            if cls._pool is not None and not cls._pool.closed:
                return cls._pool

            logger.info("Creating MySQL connection pool (max size %s)", POOL_MAX_SIZE)
            cls._pool = await aiomysql.create_pool(
                host=cls.mysql_host,
                user=cls.mysql_user,
                password=cls.mysql_pass,
                db=cls.mysql_db,
                autocommit=False,
                minsize=POOL_MIN_SIZE,
                maxsize=POOL_MAX_SIZE,
                pool_recycle=POOL_RECYCLE_SECONDS,
            )
            return cls._pool

    @classmethod
    async def close_pool(cls) -> None:
        """Close the shared connection pool and wait for connections to finish."""
        if cls._pool is None:
            return
        pool, cls._pool = cls._pool, None
        pool.close()
        await pool.wait_closed()
        logger.info("MySQL connection pool closed")

    async def __aenter__(self) -> aiomysql.Cursor:
        """Enter the async context and borrow a database connection.

        Acquires a connection from the shared pool and returns a cursor for
        database operations.

        Returns:
            Database cursor for executing queries.
        """
        pool = await self.get_pool()
        self.con = await pool.acquire()
        self.cur = await self.con.cursor(aiomysql.DictCursor if self.use_dict else aiomysql.Cursor)
        return self.cur

    async def __aexit__(self, exc_type: Optional[Type[BaseException]], exc_value: Optional[BaseException],
                        exc_traceback: Optional[Any]) -> None:
        """Exit the async context and handle cleanup.

        Commits or rolls back transactions based on whether an exception occurred,
        then closes the cursor and returns the connection to the shared pool.

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
        except Exception:
            # A broken connection cannot be committed or rolled back. Close it so
            # the pool discards it instead of handing it out again.
            logger.exception("Failed to finalise database transaction")
            self.con.close()
            # Never mask the error that the caller was already raising
            if exc_type is None:
                raise
        finally:
            if self.cur is not None:
                await self.cur.close()
            pool = self._pool
            if pool is not None:
                pool.release(self.con)
            self.cur = None
            self.con = None
