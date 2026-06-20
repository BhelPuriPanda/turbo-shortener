import dotenv from 'dotenv';
dotenv.config();

import { PubSub } from '@google-cloud/pubsub';
import pool from './db.js';

const pubsub = new PubSub();
const subscriptionName = 'link-clicked-sub';

function listenForClicks() {
    const subscription = pubsub.subscription(subscriptionName);

    console.log('Listening for click events...');

    subscription.on('message', async (message) => {
        try {
            const { code, clicked_at } = JSON.parse(message.data.toString());

            await pool.query(
                'INSERT INTO clicks (code, clicked_at) VALUES ($1, $2)',
                [code, clicked_at]
            );

            console.log(`Recorded click for ${code}`);
            message.ack();
        } catch (err) {
            console.error('Failed to process click event:', err);
            message.nack();
        }
    });

    subscription.on('error', (err) => {
        console.error('Subscription error:', err);
    });
}

listenForClicks();