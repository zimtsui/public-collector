import WebSocket from 'ws';
import Autonomous from 'autonomous';
import Database from 'async-sqlite';
import process from 'process';
import {
    Trade,
    Orderbook,
} from 'interfaces';

const ACTIVE_CLOSE = 4000;

class PublicCollector extends Autonomous {
    private db = new Database(process.argv[2]);
    private okexTrades!: WebSocket;
    private okexOrderbook!: WebSocket;
    private bitmexTrades!: WebSocket;
    private bitmexOrderbook!: WebSocket;

    protected async _start(): Promise<void> {
        await this.db.start();
        await this.db.sql(`CREATE TABLE okex_trades(
            time    BIGINT,
            price   BIGINT,
            amount  DOUBLE PRECISION,
            action  CHAR(3)
        );`).catch(err => {
            if (err.errno !== 1) throw err;
        });
        await this.db.sql(`CREATE TABLE okex_orderbook(
            time        BIGINT,
            bid_price   BIGINT,
            ask_price   BIGINT
        );`).catch(err => {
            if (err.errno !== 1) throw err;
        });
        await this.db.sql(`CREATE TABLE bitmex_trades(
            time    BIGINT,
            price   BIGINT,
            amount  DOUBLE PRECISION,
            action  CHAR(3)
        );`).catch(err => {
            if (err.errno !== 1) throw err;
        });
        await this.db.sql(`CREATE TABLE bitmex_orderbook(
            time        BIGINT,
            bid_price   BIGINT,
            ask_price   BIGINT
        );`).catch(err => {
            if (err.errno !== 1) throw err;
        });





        this.okexTrades = new WebSocket(
            `ws://localhost:12001/okex/btc-usd-swap/usd/trades`
        );
        this.okexTrades.on('error', console.error);
        this.okexTrades.on('close', code => {
            if (code !== ACTIVE_CLOSE)
                console.error(new Error('public center closed'))
        });
        this.okexTrades.on('message', (message: string) => {
            const data = JSON.parse(message);
            const trades = <Trade[]>data;
            for (const trade of trades)
                this.db.sql(`
                    INSERT INTO okex_trades
                    (time, price, amount, action)
                    VALUES(%d, %d, %d, '%s')
                ;`, trade.time,
                    trade.price,
                    trade.amount,
                    trade.action,
                ).catch(console.error);
        });





        this.okexOrderbook = new WebSocket(
            `ws://localhost:12001/okex/btc-usd-swap/usd/orderbook`
        );
        this.okexOrderbook.on('error', console.error);
        this.okexOrderbook.on('close', code => {
            if (code !== ACTIVE_CLOSE)
                console.error(new Error('public center closed'))
        });
        this.okexOrderbook.on('message', (message: string) => {
            const data = JSON.parse(message);
            const orderbook = <Orderbook>data;
            this.db.sql(`
                INSERT INTO okex_orderbook
                (time, bid_price, ask_price)
                VALUES(%d, %d, %d)
            ;`, Date.now(),
                orderbook.bids[0].price,
                orderbook.asks[0].price,
            ).catch(console.error);
        });





        this.bitmexTrades = new WebSocket(
            `ws://localhost:12001/bitmex/xbtusd/usd/trades`
        );
        this.bitmexTrades.on('error', console.error);
        this.bitmexTrades.on('close', code => {
            if (code !== ACTIVE_CLOSE)
                console.error(new Error('public center closed'))
        });
        this.bitmexTrades.on('message', (message: string) => {
            const data = JSON.parse(message);
            const trades = <Trade[]>data;
            for (const trade of trades)
                this.db.sql(`
                    INSERT INTO bitmex_trades
                    (time, price, amount, action)
                    VALUES(%d, %d, %d, '%s')
                ;`, trade.time,
                    trade.price,
                    trade.amount,
                    trade.action,
                ).catch(console.error);
        });





        this.bitmexOrderbook = new WebSocket(
            `ws://localhost:12001/bitmex/xbtusd/usd/orderbook`
        );
        this.bitmexOrderbook.on('error', console.error);
        this.bitmexOrderbook.on('close', code => {
            if (code !== ACTIVE_CLOSE)
                console.error(new Error('public center closed'))
        });
        this.bitmexOrderbook.on('message', (message: string) => {
            const data = JSON.parse(message);
            const orderbook = <Orderbook>data;
            this.db.sql(`
                INSERT INTO bitmex_orderbook
                (time, bid_price, ask_price)
                VALUES(%d, %d, %d)
            ;`, Date.now(),
                orderbook.bids[0].price,
                orderbook.asks[0].price,
            ).catch(console.error);
        });
    }

    protected async _stop(): Promise<void> {
        if (this.okexTrades) this.okexTrades.close();
        if (this.okexOrderbook) this.okexOrderbook.close();
        if (this.bitmexTrades) this.bitmexTrades.close();
        if (this.bitmexOrderbook) this.bitmexOrderbook.close();
        await this.db.stop();
    }
}

export default PublicCollector;
export { PublicCollector };