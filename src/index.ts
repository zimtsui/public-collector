import WebSocket from 'ws';
import { Autonomous } from 'autonomous';
import Database from 'async-sqlite';
import process from 'process';
import { readJsonSync } from 'fs-extra';
import { join } from 'path';
import { once } from 'events';
import {
    Trade,
    Orderbook,
} from 'interfaces';

const ACTIVE_CLOSE = 'public-collector';

const markets: string[] = readJsonSync(join(__dirname,
    '../cfg/markets.json'));

const config: {
    PUBLIC_CENTER_BASE_URL: string;
} = readJsonSync(join(__dirname,
    '../cfg/config.json'));

/*
    这个程序除了创建表使用了 sqlite 方言之外，其他地方都使用标准 sql。
    移植到其他数据库只需修改创建表的部分。
*/

class PublicCollector extends Autonomous {
    private db = new Database(process.argv[2]);
    private center: {
        [market: string]: {
            trades: WebSocket;
            orderbook: WebSocket;
        }
    } = {};
    private latest: {
        [markets: string]: {
            maxBidPrice?: number,
            minAskPrice?: number,
        }
    } = {};
    private marketId = new Map<string, number>();

    protected async _start(): Promise<void> {
        await this.db.start();

        await this.db.sql(`
        CREATE TABLE IF NOT EXISTS markets(
            id      SMALLINT    NOT NULL    UNIQUE,
            name    VARCHAR(30) NOT NULL    UNIQUE
        );`);

        for (const market of markets) {
            let rows = <any[]>await this.db.sql(`
                SELECT * FROM markets
                WHERE name = '%s'
            ;`, market);
            if (!rows.length) {
                const ids = <any[]>await this.db.sql(`
                    SELECT * FROM markets
                ;`);
                await this.db.sql(`
                    INSERT INTO markets
                    (id, name)
                    VALUES(%d, '%s')
                ;`, ids.length,
                    market,
                );
                rows = <any[]>await this.db.sql(`
                    SELECT * FROM markets
                    WHERE name = '%s'
                ;`, market);
            }
            this.marketId.set(market, rows[0].id);
        }

        await this.db.sql(`
        CREATE TABLE IF NOT EXISTS trades(
            market_id   SMALLINT            NOT NULL    REFERENCES markets(id),
            time        BIGINT              NOT NULL,
            price       BIGINT              NOT NULL,
            amount      DOUBLE PRECISION    NOT NULL,
            action      CHAR(3)             NOT NULL
        );`);

        await this.db.sql(`
        CREATE TABLE IF NOT EXISTS orderbooks(
            market_id   SMALLINT    NOT NULL    REFERENCES markets(id),
            time        BIGINT      NOT NULL,
            bid_price   BIGINT      NOT NULL,
            ask_price   BIGINT      NOT NULL
        );`);

        for (const market of markets) {
            this.center[market] = {
                orderbook: this.connectOrderbook(market),
                trades: this.connectTrades(market),
            }

            this.latest[market] = {};
        }
    }

    private connectTrades(market: string): WebSocket {
        const centerTrades = new WebSocket(
            `${config.PUBLIC_CENTER_BASE_URL}/${market}/trades`
        );
        centerTrades.on('error', console.error);
        centerTrades.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) {
                console.error(new Error(
                    `public center for ${market}/trades closed: ${code}`));
                this.stop();
            }
        });
        centerTrades.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                const trades = <Trade[]>data;
                for (const trade of trades)
                    this.db.sql(`
                        INSERT INTO trades
                        (market_id, time, price, amount, action)
                        VALUES(%d, %d, %d, %d, '%s')
                    ;`, this.marketId.get(market),
                        trade.time,
                        trade.price,
                        trade.amount,
                        trade.action,
                    ).catch(err => {
                        console.error(err);
                        this.stop();
                    });
            } catch (err) {
                console.error(err);
                this.stop();
            }

        });
        return centerTrades;
    }

    private connectOrderbook(market: string): WebSocket {
        const centerOrderbook = new WebSocket(
            `${config.PUBLIC_CENTER_BASE_URL}/${market}/orderbook`
        );
        centerOrderbook.on('error', console.error);
        centerOrderbook.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) {
                console.error(new Error(
                    `public center for ${market}/orderbook closed: ${code}`));
                this.stop();
            }
        });
        centerOrderbook.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                const orderbook = <Orderbook>data;
                if (
                    orderbook.asks.length > 0
                    && orderbook.bids.length > 0
                    && !(
                        orderbook.bids[0].price === this.latest[market].maxBidPrice
                        && orderbook.asks[0].price === this.latest[market].minAskPrice
                    )
                ) {
                    this.latest[market].maxBidPrice = orderbook.bids[0].price;
                    this.latest[market].minAskPrice = orderbook.asks[0].price;
                    this.db.sql(`
                        INSERT INTO orderbooks
                        (market_id, time, bid_price, ask_price)
                        VALUES(%d, %d, %d, %d)
                    ;`, this.marketId.get(market),
                        orderbook.time,
                        orderbook.bids[0].price,
                        orderbook.asks[0].price,
                    ).catch(err => {
                        console.error(err);
                        this.stop();
                    });
                }
            } catch (err) {
                console.error(err);
                this.stop();
            }
        });
        return centerOrderbook;
    }

    protected async _stop(): Promise<void> {
        // 不能先关数据库再关网络，不然数据库永远在等待写入队列数据库写入失败。
        const stopped: Promise<unknown>[] = [];
        for (const market of markets)
            if (this.center[market]) {
                let center;
                center = this.center[market].trades;
                if (center.readyState < 2) center.close(1000, ACTIVE_CLOSE);
                if (center.readyState < 3) stopped.push(once(center, 'close'));
                center = this.center[market].orderbook;
                if (center.readyState < 2) center.close(1000, ACTIVE_CLOSE);
                if (center.readyState < 3) stopped.push(once(center, 'close'));
            }
        await Promise.all(stopped);
        await this.db.stop();
    }
}

export default PublicCollector;
export { PublicCollector };