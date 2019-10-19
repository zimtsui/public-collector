import WebSocket from 'ws';
import Autonomous from 'autonomous';
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

class PublicCollector extends Autonomous {
    private db = new Database(process.argv[2]);
    private center: {
        [market: string]: {
            trades: WebSocket;
            orderbook: WebSocket;
        }
    } = {};

    protected async _start(): Promise<void> {
        await this.db.start();

        for (const market of markets) {

            await this.db.sql(`CREATE TABLE "${market}/trades"(
                    local_time    BIGINT,
                    price   BIGINT,
                    amount  DOUBLE PRECISION,
                    action  CHAR(3)
                );`).catch(err => {
                if (err.errno !== 1) throw err;
            });
            await this.db.sql(`CREATE TABLE "${market}/orderbook"(
                local_time  BIGINT,
                bid_price   BIGINT,
                ask_price   BIGINT
            );`).catch(err => {
                if (err.errno !== 1) throw err;
            });

            this.center[market] = {
                orderbook: this.connectOrderbook(market),
                trades: this.connectTrades(market),
            }
        }
    }

    private connectTrades(market: string): WebSocket {
        const centerTrades = new WebSocket(
            `ws://localhost:12001/${market}/trades`
        );
        centerTrades.on('error', console.error);
        centerTrades.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) console.error(new Error(
                `public center for ${market} closed: ${code}`));
        });
        centerTrades.on('message', (message: string) => {
            // console.log('trades message');
            try {
                const data = JSON.parse(message);
                const trades = <Trade[]>data;
                for (const trade of trades)
                    this.db.sql(`
                        INSERT INTO "${market}/trades"
                        (local_time, price, amount, action)
                        VALUES(%d, %d, %d, '%s')
                    ;`, trade.time,
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
            `ws://localhost:12001/${market}/orderbook`
        );
        centerOrderbook.on('error', console.error);
        centerOrderbook.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) console.error(new Error(
                `public center for ${market} closed: ${code}`))
        });
        centerOrderbook.on('message', (message: string) => {
            // console.log('trades message');

            try {
                const data = JSON.parse(message);
                const orderbook = <Orderbook>data;
                if (
                    orderbook.asks.length > 0
                    && orderbook.bids.length > 0
                ) this.db.sql(`
                    INSERT INTO "${market}/orderbook"
                    (local_time, bid_price, ask_price)
                    VALUES(%d, %d, %d)
                ;`, Date.now(),
                    orderbook.bids[0].price,
                    orderbook.asks[0].price,
                ).catch(err => {
                    console.error(err);
                    this.stop();
                });
            } catch (err) {
                console.error(err);
                this.stop();
            }
        });
        return centerOrderbook;
    }

    protected async _stop(): Promise<void> {
        // 必须先管网络再关数据库，不然数据库永远在等待写入队列空。
        console.log(0);
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
        console.log(1);
        await this.db.stop();
        console.log(2);
    }
}

export default PublicCollector;
export { PublicCollector };